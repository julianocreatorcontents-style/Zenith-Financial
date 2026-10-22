
export const PERFIS = {
  'Rafael': {
    area: 'direito',
    emoji: '⚖️',
    saudacao: 'Pagamento protocolado. Petição de quitação deferida.',
    corpo_individual: (v: number, d: string, p?: number, t?: number, i?: string, f?: string) => 
      `Cláusula vigente do acordo ${d}:\n${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\nVencimento conforme instrumento.\n\n📅 Período: ${i || 'N/A'} ~ ${f || 'N/A'}\n📊 Progresso: ${p || '?'}ª de ${t || '?'} parcelas`,
    corpo_rateio: (v: number, g: string) => 
      `Participação no rateio ${g}:\n${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: Contínuo`,
    encerramento: 'O restante é mera formalidade processual.',
    assinatura: 'Nada a opor.'
  },
  'Alexandre': {
    area: 'fibra',
    emoji: '🌊',
    saudacao: 'Sinal financeiro estável. Manutenção programada na rede.',
    corpo_individual: (v: number, d: string, p?: number, t?: number, i?: string, f?: string) => 
      `💳 ${d}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: ${i || 'N/A'} ~ ${f || 'N/A'}\n📊 Progresso: ${p || '?'}ª de ${t || '?'}`,
    corpo_rateio: (v: number, g: string) => 
      `${g}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: Contínuo`,
    encerramento: 'Cada parcela é um pacote de dados a menos na rede. Latência zero pra preocupação.',
    assinatura: 'Sinal estável. Segue o fluxo.'
  },
  'Juliano': {
    area: 'historia',
    emoji: '📚',
    saudacao: 'Esse mês a agenda financeira está densa como um tratado do século XIX. Vamos por partes:',
    corpo_individual: (v: number, d: string, p?: number, t?: number, i?: string, f?: string) => 
      `📿 ${d}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: ${i || 'N/A'} ~ ${f || 'N/A'}\n📊 Progresso: ${p || '?'}ª de ${t || '?'}`,
    corpo_rateio: (v: number, g: string) => 
      `🏠 ${g}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: Contínuo`,
    encerramento: 'É lastro, Juliano. Saúde, propósito, conhecimento e o teto sobre a cabeça. Nada disso é supérfluo.',
    assinatura: 'Assim caminha a humanidade.'
  },
  'Patrícia': {
    area: 'enfermagem',
    emoji: '🏥',
    saudacao: 'Sinais vitais financeiros estáveis.',
    corpo_individual: (v: number, d: string) => 
      `Prescrição: ${d}\n${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    corpo_rateio: (v: number, g: string) => 
      `${g}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: Contínuo`,
    encerramento: 'Nada fora da curva. O plantão segue tranquilo.',
    assinatura: 'Um descanso merecido pra você.'
  },
  'Valdemar': {
    area: 'cartazista',
    emoji: '🎨',
    saudacao: 'ATENÇÃO: CARTAZ DO MÊS',
    corpo_individual: (v: number, d: string) => 
      `${d}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    corpo_rateio: (v: number, g: string) => 
      `${g}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (contínuo)`,
    encerramento: 'Letreiro bem legível, sem pressa pra ler.',
    assinatura: 'Letras garrafais, vida simples.'
  },
  'Linda': {
    area: 'lar',
    emoji: '🏡',
    saudacao: 'Página virada. A engrenagem da casa rodou lisa. Esse mês começa zerado.',
    corpo_individual: (v: number, d: string) => 
      `${d}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    corpo_rateio: (v: number, g: string) => 
      `${g}: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📅 Período: Contínuo`,
    encerramento: 'Mais uma voltinha no carrossel das contas. Nada que você já não tenha domado antes.',
    assinatura: 'Respira. Você dá conta.'
  }
};

export function gerarMensagemPix(pessoa: string, dados: any, chavePix: string) {
  const perfil = PERFIS[pessoa as keyof typeof PERFIS];
  if (!perfil) return '';

  let msg = `${perfil.emoji} ${perfil.saudacao}\n\n`;

  if (dados.gastos_individuais) {
    dados.gastos_individuais.forEach((g: any) => {
      msg += perfil.corpo_individual(g.valor, g.descricao, g.parcela, g.total_parcelas, g.inicio, g.fim) + '\n\n';
    });
  }

  if (dados.gastos_rateios) {
    dados.gastos_rateios.forEach((g: any) => {
      msg += perfil.corpo_rateio(g.valor, g.grupo) + '\n\n';
    });
  }

  msg += `💰 Total do mês: ${dados.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n`;
  msg += `💳 *Pagamento:*\nPix copia e cola:\n\`${chavePix}\`\n(Juliano Knazh)\n\n`;
  msg += perfil.encerramento + '\n\n';
  msg += '─'.repeat(43) + '\n\n';
  msg += perfil.assinatura;

  return msg;
}
