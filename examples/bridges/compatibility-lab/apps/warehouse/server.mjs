import { server } from './application.mjs';

server.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
