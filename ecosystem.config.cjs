/**
 * PM2 — รัน API production
 * บนเซิร์ฟเวอร์: cd <path-to-BE> && pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [
    {
      name: 'invoice-api',
      cwd: __dirname,
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
