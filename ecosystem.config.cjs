// PM2 (Windows ou Linux sem Docker): pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "rh-gcf",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
    },
  ],
};
