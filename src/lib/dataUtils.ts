/**
 * Utilidades para detecção e correção de chaves duplicadas no React.
 * Baseado no PRD de Correção de Erro "Encountered two children with the same key".
 */

/**
 * Detecta duplicatas em um array baseado em um campo específico.
 */
export function checkDuplicates(arr: any[], keyField = 'id'): void {
  const seen = new Set();
  const duplicates: any[] = [];

  arr.forEach(item => {
    const key = item[keyField];
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }
  });

  if (duplicates.length > 0) {
    console.warn(`⚠️ Duplicatas encontradas no campo "${keyField}":`, duplicates);
  } else {
    // console.log(`✅ Nenhuma duplicata encontrada no campo "${keyField}".`);
  }
}

/**
 * Corrige duplicatas em um array gerando novos IDs para itens colidentes.
 * Suporta caminhos aninhados (ex: 'user.uid').
 */
export function fixDuplicates(arr: any[], keyField = 'id'): any[] {
  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const setNestedValue = (obj: any, path: string, value: any) => {
    const parts = path.split('.');
    const last = parts.pop()!;
    
    // Create a deep copy of the path to avoid mutation
    const root = { ...obj };
    let current = root;
    for (const part of parts) {
      current[part] = { ...current[part] };
      current = current[part];
    }
    current[last] = value;
    return root;
  };

  const seen = new Set();
  return arr.map(item => {
    const key = getNestedValue(item, keyField);
    
    if (seen.has(key)) {
      const newId = crypto.randomUUID();
      console.warn(`⚠️ Duplicata encontrada: ${key}. Substituído por novo ID: ${newId}`);
      return setNestedValue(item, keyField, newId);
    }
    seen.add(key);
    return item;
  });
}
