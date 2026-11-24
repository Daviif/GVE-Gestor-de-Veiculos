// O Zod 4 testa `new Function('')` na primeira validação para ligar o modo "JIT". Com a CSP
// `script-src 'self'` (sem 'unsafe-eval') isso gera uma violação em toda tela. Este módulo precisa
// ser o PRIMEIRO import do main.tsx: o teste fica em cache e o @gve/shared já valida ao carregar.
import { z } from 'zod';

z.config({ jitless: true });
