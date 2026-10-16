/** Círculo com as iniciais do primeiro e do último nome. */
export function Avatar({ nome, grande = false }: { nome: string; grande?: boolean }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '');
  return (
    <span className={grande ? 'avatar avatar-grande' : 'avatar'} aria-hidden="true">
      {iniciais.toUpperCase()}
    </span>
  );
}
