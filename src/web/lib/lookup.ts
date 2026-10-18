function google(query: string, language: string | null) {
  const params = new URLSearchParams({ q: query })
  if (language === 'en' || language === 'es') params.set('hl', language)
  return `https://www.google.com/search?${params}`
}

export function meaningUrl(term: string, language: string | null) {
  return google(`${term} ${language === 'es' ? 'significado' : 'meaning'}`, language)
}

export function examplesUrl(term: string, language: string | null) {
  return google(
    language === 'es' ? `${term} ejemplos de oraciones` : `${term} example sentences`,
    language
  )
}
