import { describe, expect, it } from 'vitest';
import {
  anoAtual,
  dataComSemana,
  dataCurta,
  dataLonga,
  diaComSemana,
  diaDaSemana,
  diaMes,
  hojeEmSaoPaulo,
  inicioDaSemana,
  somarDias,
} from './datas';

describe('hoje em São Paulo', () => {
  it('usa o fuso de Brasília, não o UTC', () => {
    // 21/10 às 02:00 UTC ainda é 20/10 às 23:00 em Brasília.
    expect(hojeEmSaoPaulo(new Date('2026-10-21T02:00:00Z'))).toBe('2026-10-20');
    // 31/12 às 23:30 em Brasília já é 1º/01 em UTC, mas o ano ainda é o velho.
    expect(anoAtual(new Date('2027-01-01T02:30:00Z'))).toBe(2026);
  });
});

describe('aritmética de datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('acha a segunda-feira da semana, inclusive no domingo', () => {
    expect(inicioDaSemana('2026-10-19')).toBe('2026-10-19'); // segunda
    expect(inicioDaSemana('2026-10-22')).toBe('2026-10-19'); // quinta
    expect(inicioDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo
  });
});

describe('formatos de exibição', () => {
  it('em dd/mm/aaaa, sem deslocar o dia', () => {
    expect(diaMes('2026-01-05')).toBe('05/01');
    expect(dataCurta('2026-01-05')).toBe('05/01/2026');
    expect(diaComSemana('2026-10-20')).toBe('ter., 20/10');
    expect(dataComSemana('2026-10-20')).toBe('ter., 20/10/2026');
    expect(dataLonga('2026-10-20')).toBe('20 de outubro de 2026');
  });

  it('dia da semana por extenso', () => {
    expect(diaDaSemana('2026-10-25')).toBe('Domingo');
    expect(diaDaSemana('2026-10-26')).toBe('Segunda');
    expect(diaDaSemana('2026-10-31')).toBe('Sábado');
  });
});
