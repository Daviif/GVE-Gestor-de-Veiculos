import { describe, expect, it } from 'vitest';
import { dentroDaJanela, hojeEmSaoPaulo, janelaDeDatas } from '../src/datas';

describe('janela de reserva (RN02)', () => {
  it('reserva feita em 13/10 aceita de 18/10 a 20/10 (exemplo do documento)', () => {
    expect(janelaDeDatas('2026-10-13')).toEqual(['2026-10-18', '2026-10-19', '2026-10-20']);
    expect(dentroDaJanela('2026-10-17', '2026-10-13')).toBe(false);
    expect(dentroDaJanela('2026-10-21', '2026-10-13')).toBe(false);
  });

  it('atravessa o fim do mês e do ano', () => {
    expect(janelaDeDatas('2026-12-28')).toEqual(['2027-01-02', '2027-01-03', '2027-01-04']);
  });

  it('conta a partir do dia em Brasília, não do UTC', () => {
    // 13/10 às 23:30 em Brasília já é 14/10 em UTC: a janela continua sendo a do dia 13.
    const hoje = hojeEmSaoPaulo(new Date('2026-10-14T02:30:00Z'));
    expect(hoje).toBe('2026-10-13');
    expect(janelaDeDatas(hoje)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20']);
  });
});
