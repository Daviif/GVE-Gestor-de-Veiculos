import { criarApp } from './app';
import { config } from './config';

criarApp().listen(config.API_PORT, () => {
  console.log(`Backend em http://localhost:${config.API_PORT}/api/v1`);
});
