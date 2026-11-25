module.exports = {
  apps: [
    {
      name: 'urusyn-absen',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '250M',
      env: { NODE_ENV: 'production' },
      time: true,
    },
  ],
};
