export function friendlyFirebaseError(err: any): string {
  const code = String(err?.code ?? err?.message ?? '');
  
  if (code.includes('auth/network-request-failed') || code.includes('network-request-failed')) {
    return 'Sem conexão com a internet. Verifique seu Wi-Fi e tente novamente.';
  }
  if (code.includes('auth/popup-closed-by-user')) {
    return 'Login cancelado.';
  }
  if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) {
    return 'E-mail ou senha incorretos.';
  }
  if (code.includes('auth/too-many-requests')) {
    return 'Muitas tentativas. Aguarde um momento.';
  }
  if (code.includes('auth/invalid-email')) {
    return 'E-mail inválido.';
  }
  if (code.includes('auth/email-already-in-use')) {
    return 'Este e-mail já está cadastrado. Faça login.';
  }
  if (code.includes('auth/weak-password')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  return err?.message || 'Ocorreu um erro inesperado.';
}
