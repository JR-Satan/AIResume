// 设备信息解析（用于「模拟扫码登录」）
//
// 思路：在局域网下用手机浏览器访问站点时，读取 navigator.userAgent，
// 解析出一个「稳定的设备版本标识」。同一台手机（同系统版本）每次解析结果一致，
// 因此可以把它当作账号用户名 —— 一个版本对应唯一的一个账号。

// 解析结果
export interface DeviceInfo {
  // 稳定的设备版本标识，用作扫码登录的账号用户名，如 "iPhone · iOS 17.4"
  versionKey: string;
  // 是否为移动端浏览器（PC 端无法演示扫码，只能展示二维码引导）
  isMobile: boolean;
  // 原始 UA，便于排查
  raw: string;
}

// 提取系统版本号（点分版本，下划线归一为点）
const matchVersion = (ua: string, re: RegExp): string => {
  const m = ua.match(re);
  return m ? m[1].replace(/_/g, '.') : '';
};

// 从 UA 推断品牌/机型 + 系统版本，组合成稳定的版本标识
export const parseDeviceInfo = (ua: string = navigator.userAgent): DeviceInfo => {
  const raw = ua || '';
  const isIOS = /iPhone|iPad|iPod/i.test(raw);
  const isAndroid = /Android/i.test(raw);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(raw);

  let brand = '未知设备';
  let version = '';

  if (isIOS) {
    brand = /iPad/i.test(raw) ? 'iPad' : /iPod/i.test(raw) ? 'iPod' : 'iPhone';
    version = `iOS ${matchVersion(raw, /OS (\d+([_.]\d+)+)/i) || '?'}`;
  } else if (isAndroid) {
    // 取 "Android x.y; <型号>" 中的型号；型号可能形如 "Build/" 之前的串
    const model = raw.match(/Android [^;]+;\s*([^;)]+?)(?:\s+Build|\)|;)/i);
    brand = model ? model[1].trim() : 'Android 设备';
    version = `Android ${matchVersion(raw, /Android (\d+([.]\d+)*)/i) || '?'}`;
  } else {
    // 非移动端：用浏览器内核大致区分（仅用于占位，PC 端不真正扫码登录）
    if (/Edg\//i.test(raw)) brand = 'Edge';
    else if (/Chrome\//i.test(raw)) brand = 'Chrome';
    else if (/Firefox\//i.test(raw)) brand = 'Firefox';
    else if (/Safari\//i.test(raw)) brand = 'Safari';
    version = 'Desktop';
  }

  const versionKey = `${brand} · ${version}`;
  return { versionKey, isMobile, raw };
};
