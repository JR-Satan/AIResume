/**
 * 3-4 大模型润色组模型请求 worker。
 *
 * worker 负责在后台执行大模型请求、解析流式/非流式响应并返回给页面，避免评分、润色和
 * 结构诊断阻塞主线程。请求默认使用 temperature: 0，保证同一份简历的结果尽量稳定。
 */
self.onmessage = async (event) => {
  const { taskId, messages, userApiKey, model, API_URL, requestOptions = {} } = event.data;
  const { timeoutMs, ...apiRequestOptions } = requestOptions as { timeoutMs?: number; [key: string]: unknown };
  const controller = new AbortController();
  const timeout = Number(timeoutMs) > 0
    ? setTimeout(() => controller.abort(), Number(timeoutMs))
    : null;
  const requestData = {
    model,
    messages,
    stream: true, // 流式响应
    ...apiRequestOptions,
    temperature: 0,
  };
  const postError = (errorMessage: string) => {
    self.postMessage({ taskId, isComplete: true, result: errorMessage, error: errorMessage });
  };
  const readChoiceContent = (value: any): string => {
    const choice = value?.choices?.[0];
    return String(
      choice?.message?.content ||
      choice?.delta?.content ||
      choice?.text ||
      value?.output_text ||
      value?.content ||
      ''
    );
  };
  const parseSseText = (rawText: string): string => {
    let content = '';
    rawText.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) return;
      const jsonLine = trimmed.slice(6).trim();
      if (!jsonLine || jsonLine === '[DONE]') return;
      try {
        content += readChoiceContent(JSON.parse(jsonLine));
      } catch {
        content += jsonLine;
      }
    });
    return content.trim();
  };
  const parseNonStreamText = (rawText: string): string => {
    // 兼容 OpenAI 格式接口的多种返回形态：标准 JSON、SSE 文本或直接返回的纯文本。
    const trimmed = rawText.trim();
    if (!trimmed) return '';
    try {
      const parsedResponse = JSON.parse(trimmed);
      const messageContent = readChoiceContent(parsedResponse);
      if (messageContent) return messageContent;
      return typeof parsedResponse === 'string' ? parsedResponse : JSON.stringify(parsedResponse);
    } catch {
      const sseContent = parseSseText(trimmed);
      return sseContent || trimmed;
    }
  };
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userApiKey}`, // 认证信息
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });
    if (response.status === 401) {
      postError('认证失败，请检查 API Key 是否正确');
      return;
    } else if (!response.ok) {
      postError(`请求失败，错误码: ${response.status}`);
      return;
    }
    if (requestData.stream === false) {
      try {
        const rawText = await response.text();
        const messageContent = parseNonStreamText(rawText);
        if (!messageContent) {
          postError('服务返回为空，请稍后重试');
          return;
        }
        self.postMessage({ taskId, isComplete: true, result: messageContent });
      } catch (error) {
        postError('读取模型响应时出错，请稍后重试');
      }
      return;
    }

    if (!response.body) {
      postError('服务器未返回流数据');
      return;
    }

    // 读取流式响应数据（sse）
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentText = '';  //存结果
    let buffer = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return false;
      const jsonLine = trimmed.slice(6).trim();  // 移除 `data: ` 前缀
      if (jsonLine === '[DONE]') {
        self.postMessage({ taskId, isComplete: true, result: currentText });
        return true;
      }
      try {
        const parsedLine = JSON.parse(jsonLine);
        const deltaContent = parsedLine?.choices?.[0]?.delta?.content;
        if (deltaContent) {
          currentText += deltaContent;
          self.postMessage({ taskId, isComplete: false, result: currentText });
        }
      } catch (err) {
        postError('解析流数据时出错，请稍后重试');
        return true;
      }
      return false;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      // 流式响应数据：
      // {"id":"****","choices":[{"delta":{"content":"我是","function_call":null,"refusal":null,"role":null,"tool_calls":null},
      // "finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,
      // "model":"qwen-plus","object":"chat.completion.chunk","service_tier":null,
      // "system_fingerprint":null,"usage":null}
      for (const line of lines) {
        if (processLine(line)) return;
      }
    }
    if (buffer.trim() && processLine(buffer)) return;
    self.postMessage({ taskId, isComplete: true, result: currentText });
  } catch (error) {
    const isAbortError = error instanceof DOMException && error.name === 'AbortError';
    postError(isAbortError ? '请求超时，请稍后重试或减少输入内容' : '请求失败，请稍后重试');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
