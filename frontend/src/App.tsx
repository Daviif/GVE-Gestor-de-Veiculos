import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RotaProtegida } from './auth/RotaProtegida';
import { ProvedorSessao } from './auth/sessao';
import { Layout } from './componentes/Layout';
import { itensAdmin } from './componentes/navegacao';
import { EmConstrucao } from './paginas/EmConstrucao';
import { Login } from './paginas/Login';
import { MinhaConta } from './paginas/MinhaConta';
import { MinhasReservas } from './paginas/MinhasReservas';
import { TrocaSenha } from './paginas/TrocaSenha';
import { ProvedorToast } from './toast/ProvedorToast';

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
          <Route path="/reservas/nova" element={<EmConstrucao />} />
          <Route path="/agenda" element={<EmConstrucao />} />
          <Route path="/conta" element={<MinhaConta />} />
          <Route element={<RotaProtegida perfil="ADMINISTRADOR" />}>
            {itensAdmin.map((item) => (
              <Route key={item.caminho} path={item.caminho} element={<EmConstrucao />} />
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
