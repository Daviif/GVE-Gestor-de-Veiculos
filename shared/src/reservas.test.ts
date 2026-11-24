import { describe, expect, it } from 'vitest';
import {
  dataSchema,
  horarioDoTurno,
  novaReservaSchema,
  situacaoDaReserva,
  turnoJaComecou,
} from './index';

// Horários de Brasília (UTC-3) escritos em UTC: 07:00 BRT = 10:00Z, 13:00 BRT = 16:00Z.
const em = (iso: string) => new Date(iso);

describe('horário dos turnos', () => {
  it('matutino das 7h às 12h e vespertino das 13h às 17h', () => {
    expect(horarioDoTurno('MATUTINO')).toBe('7h às 12h');
    expect(horarioDoTurno('VESPERTINO')).toBe('13h às 17h');
  });
});

describe('turno já começou (RN05)', () => {
  it('reserva de outro dia: passada sim, futura não', () => {
    const agora = em('2026-10-21T15:00:00Z');
    expect(turnoJaComecou('2026-10-20', 'VESPERTINO', agora)).toBe(true);
    expect(turnoJaComecou('2026-10-22', 'MATUTINO', agora)).toBe(false);
  });

  it('matutino de hoje começa às 7h de Brasília', () => {
    expect(turnoJaComecou('2026-10-21', 'MATUTINO', em('2026-10-21T09:59:00Z'))).toBe(false);
    expect(turnoJaComecou('2026-10-21', 'MATUTINO', em('2026-10-21T10:00:00Z'))).toBe(true);
  });

  it('vespertino de hoje começa às 13h de Brasília', () => {
    expect(turnoJaComecou('2026-10-21', 'VESPERTINO', em('2026-10-21T15:59:00Z'))).toBe(false);
    expect(turnoJaComecou('2026-10-21', 'VESPERTINO', em('2026-10-21T16:00:00Z'))).toBe(true);
  });

  it('usa o dia de Brasília, não o UTC', () => {
    // 22/10 às 01:00 UTC ainda é 21/10 às 22:00 em Brasília: a reserva de 22/10 é futura.
    expect(turnoJaComecou('2026-10-22', 'MATUTINO', em('2026-10-22T01:00:00Z'))).toBe(false);
    expect(turnoJaComecou('2026-10-21', 'MATUTINO', em('2026-10-22T01:00:00Z'))).toBe(true);
  });
});

describe('nova reserva', () => {
  it('só aceita os dois turnos (RN04)', () => {
    const base = { data: '2026-10-28', veiculoId: 1, destino: 'Escola' };
    expect(novaReservaSchema.safeParse({ ...base, turno: 'MATUTINO' }).success).toBe(true);
    expect(
      novaReservaSchema.safeParse({ ...base, turno: 'NOTURNO' }).error?.issues[0]?.message,
    ).toBe('Selecione o turno.');
  });

  it('exige destino, mesmo que só com espaços (RN06)', () => {
    const base = { data: '2026-10-28', turno: 'MATUTINO', veiculoId: 1 };
    for (const destino of ['', '   ']) {
      expect(novaReservaSchema.safeParse({ ...base, destino }).error?.issues[0]?.message).toBe(
        'Informe o destino.',
      );
    }
  });
});

describe('dataSchema', () => {
  it.each(['2026-02-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32'])(
    'recusa %s sem lançar exceção',
    (data) => {
      expect(dataSchema.safeParse(data).success).toBe(false);
    },
  );

  it('aceita 29/02 só em ano bissexto', () => {
    expect(dataSchema.safeParse('2028-02-29').success).toBe(true);
    expect(dataSchema.safeParse('2026-02-29').success).toBe(false);
  });
});

describe('situacaoDaReserva (RC02)', () => {
  const hoje = { status: 'ATIVA' as const, data: '2026-11-05', turno: 'MATUTINO' as const };

  it('a de hoje é agendada até o turno começar e concluída depois', () => {
    expect(situacaoDaReserva(hoje, em('2026-11-05T09:59:00Z'))).toBe('AGENDADA');
    expect(situacaoDaReserva(hoje, em('2026-11-05T10:00:00Z'))).toBe('CONCLUIDA');
  });

  it('a de ontem é concluída e a de amanhã, agendada', () => {
    const agora = em('2026-11-05T12:00:00Z');
    expect(situacaoDaReserva({ ...hoje, data: '2026-11-04' }, agora)).toBe('CONCLUIDA');
    expect(situacaoDaReserva({ ...hoje, data: '2026-11-06' }, agora)).toBe('AGENDADA');
  });

  it('cancelada vale mais que a data', () => {
    expect(situacaoDaReserva({ ...hoje, status: 'CANCELADA' }, em('2026-11-01T00:00:00Z'))).toBe(
      'CANCELADA',
    );
  });
});
