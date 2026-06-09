import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
// 引入svg需要的插件
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
// 扫码登录中转服务（dev 中间件）
import { scanLoginServer } from './vite-plugins/scanLoginServer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const deepSeekApiKey = env.DEEPSEEK_API_KEY;

  return {
    plugins: [vue(),
    // 跨域问题
    createSvgIconsPlugin({
      iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      symbolId: 'icon-[dir]-[name]',
    }),
    scanLoginServer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // 监听局域网地址，手机扫码后可通过同网段 IP 访问站点
    server: {
      host: true,
      proxy: {
        '/deepseek-api': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: proxyPath => proxyPath.replace(/^\/deepseek-api/, ''),
          configure: proxy => {
            if (!deepSeekApiKey) return;
            proxy.on('proxyReq', proxyReq => {
              proxyReq.setHeader('Authorization', `Bearer ${deepSeekApiKey}`);
            });
          },
        },
      },
    },
    base: './',
    mode: 'development',
    worker: {
      format: 'es',
    },
  };
})
