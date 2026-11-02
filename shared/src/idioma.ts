import { z } from 'zod';

// RNF05: interface inteiramente em português. As mensagens dos schemas já são escritas à mão;
// isto cobre as genéricas do Zod (ex.: corpo que não é objeto), que viriam em inglês.
z.config(z.locales.ptBR());
