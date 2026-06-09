// 发送请求的worker
self.onmessage = async (event) => {
  const { taskId, messages, userApiKey, model, API_URL, requestOptions = {} } = event.data;
  const requestData = {
    model,
    messages,
    stream: true, // 流式响应
    ...requestOptions,
  };
  const postError = (errorMessage: string) => {
    self.postMessage({ taskId, isComplete: true, result: errorMessage, error: errorMessage });
  };
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userApiKey}`, // 认证信息
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    if (response.status === 401) {
      postError('认证失败，请检查 API Key 是否正确');
      return;
    } else if (!response.ok) {
      postError(`请求失败，错误码: ${response.status}`);
      return;
    }
    if (!response.body) {
      postError('服务器未返回流数据');
      return;
    }

    if (requestData.stream === false) {
      try {
        const parsedResponse = await response.json();
        const messageContent =
          parsedResponse?.choices?.[0]?.message?.content ||
          parsedResponse?.choices?.[0]?.delta?.content ||
          '';
        self.postMessage({ taskId, isComplete: true, result: messageContent });
      } catch (error) {
        postError('解析非流式响应时出错，请稍后重试');
      }
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
    postError('请求失败，请稍后重试');
  }
};
