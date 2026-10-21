import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RotaProtegida } from './auth/RotaProtegida';
import { ProvedorSessao } from './auth/sessao';
import { Layout } from './componentes/Layout';
import { itensAdmin } from './componentes/navegacao';
import { Agenda } from './paginas/Agenda';
import { Feriados } from './paginas/admin/Feriados';
import { Usuarios } from './paginas/admin/Usuarios';
import { EmConstrucao } from './paginas/EmConstrucao';
import { Login } from './paginas/Login';
import { MinhaConta } from './paginas/MinhaConta';
import { MinhasReservas } from './paginas/MinhasReservas';
import { NovaReserva } from './paginas/reservas/NovaReserva';
import { TrocaSenha } from './paginas/TrocaSenha';
import { ProvedorToast } from './toast/ProvedorToast';

/** Telas da administração já prontas; as demais abrem "Em construção". */
const telasAdmin: Partial<Record<(typeof itensAdmin)[number]['caminho'], ReactNode>> = {
  '/admin/usuarios': <Usuarios />,
  '/admin/feriados': <Feriados />,
};

export function Rotas() {
  return (
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route element={<RotaProtegida trocaSenha />}>
        <Route path="/trocar-senha" element={<TrocaSenha />} />
      </Route>
      <Route element={<RotaProtegida />}>
        <Route element={<Layout />}>
          <Route index element={<MinhasReservas />} />
          <Route path="/reservas/nova" element={<NovaReserva />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/conta" element={<MinhaConta />} />
          <Route element={<RotaProtegida perfil="ADMINISTRADOR" />}>
            {itensAdmin.map((item) => (
              <Route
                key={item.caminho}
                path={item.caminho}
                element={telasAdmin[item.caminho] ?? <EmConstrucao />}
              />
            ))}
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ProvedorToast>
        <ProvedorSessao>
          <Rotas />
        </ProvedorSessao>
      </ProvedorToast>
    </BrowserRouter>
  );
}
