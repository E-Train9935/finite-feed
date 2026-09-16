import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`FINITE_FEED API listening on http://0.0.0.0:${config.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received; shutting down.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
