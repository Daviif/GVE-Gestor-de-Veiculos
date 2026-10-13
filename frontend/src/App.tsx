import { useEffect, useState } from 'react';

type EstadoApi = 'verificando' | 'conectada' | 'indisponivel';

const textoEstado: Record<EstadoApi, string> = {
  verificando: 'Verificando conexão com o servidor…',
  conectada: 'Servidor conectado.',
  indisponivel: 'Servidor indisponível.',
};

export function App() {
  const [estado, setEstado] = useState<EstadoApi>('verificando');

  useEffect(() => {
    fetch('/api/v1/saude')
      .then((resposta) => setEstado(resposta.ok ? 'conectada' : 'indisponivel'))
      .catch(() => setEstado('indisponivel'));
  }, []);

  return (
    <main className="pagina">
      <h1>Gestão Veicular</h1>
      <p>Secretaria Municipal de Educação de Barão de Cocais</p>
      <p role="status">{textoEstado[estado]}</p>
    </main>
  );
}
