import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra que o servidor está conectado quando a API responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Gestão Veicular' })).toBeTruthy();
    expect(await screen.findByText('Servidor conectado.')).toBeTruthy();
  });

  it('avisa quando a API não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<App />);
    expect(await screen.findByText('Servidor indisponível.')).toBeTruthy();
  });
});
