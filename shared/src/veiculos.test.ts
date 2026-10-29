import { describe, expect, it } from 'vitest';
import { veiculoSchema } from './veiculos';

describe('veiculoSchema', () => {
  it('normaliza a placa antiga e a Mercosul', () => {
    expect(veiculoSchema.parse({ placa: ' abc-1234 ', modelo: ' Fiat Argo ' })).toEqual({
      placa: 'ABC1234',
      modelo: 'Fiat Argo',
    });
    expect(veiculoSchema.parse({ placa: 'abc1d23', modelo: 'Onix' }).placa).toBe('ABC1D23');
  });

  it('recusa placa fora do padrão com mensagem em português', () => {
    const resultado = veiculoSchema.safeParse({ placa: 'AB12345', modelo: 'Onix' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe(
      'Placa inválida. Use o formato ABC1234 ou ABC1D23.',
    );
  });

  it('exige placa e modelo', () => {
    const semPlaca = veiculoSchema.safeParse({ placa: ' ', modelo: 'Onix' });
    expect(semPlaca.error?.issues[0]?.message).toBe('Informe a placa.');
    const semModelo = veiculoSchema.safeParse({ placa: 'ABC1234', modelo: '' });
    expect(semModelo.error?.issues[0]?.message).toBe('Informe o modelo.');
  });
});
