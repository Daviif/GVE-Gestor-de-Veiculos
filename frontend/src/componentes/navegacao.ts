/** Itens do menu. As telas ainda não implementadas abrem a página "Em construção". */
export const itensMenu = [
  { caminho: '/', titulo: 'Minhas reservas', aba: 'Início' },
  { caminho: '/reservas/nova', titulo: 'Nova reserva', aba: 'Reservar' },
  { caminho: '/agenda', titulo: 'Agenda da frota', aba: 'Agenda' },
  { caminho: '/conta', titulo: 'Minha conta', aba: 'Conta' },
] as const;

export const itensAdmin = [
  { caminho: '/admin/usuarios', titulo: 'Usuários' },
  { caminho: '/admin/veiculos', titulo: 'Veículos' },
  { caminho: '/admin/feriados', titulo: 'Feriados' },
  { caminho: '/admin/historico', titulo: 'Histórico' },
] as const;

export function tituloDaPagina(caminho: string): string {
  return [...itensMenu, ...itensAdmin].find((i) => i.caminho === caminho)?.titulo ?? '';
}
