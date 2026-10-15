import logotipo from '../assets/logotipo.png';

/** Logo oficial da Prefeitura de Barão de Cocais (RNF04). */
export function Logo({ className }: { className?: string }) {
  return <img src={logotipo} alt="Prefeitura de Barão de Cocais" className={className} />;
}
