import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { en } from './messages/en'
import { es } from './messages/es'

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAME: Record<Locale, string> = { en: 'English', es: 'Español' }

export type Messages = typeof en
export type MessageKey = keyof Messages
export type Message = string | { one: string; other: string }
export type Params = Record<string, string | number>
export type Translate = (key: MessageKey, params?: Params) => string

const DICTIONARIES: Record<Locale, Messages> = { en, es }
const STORAGE_KEY = 'bookworm.locale'

export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function asLocale(value: string | null | undefined) {
  return LOCALES.find((l) => l === value)
}

export function format(locale: Locale, message: Message, params: Params = {}) {
  const text =
    typeof message === 'string'
      ? message
      : message[
          new Intl.PluralRules(locale).select(Number(params.count)) === 'one' ? 'one' : 'other'
        ]
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

export function translate(locale: Locale, key: MessageKey, params?: Params) {
  return format(locale, DICTIONARIES[locale][key], params)
}

function savedLocale() {
  try {
    return asLocale(localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined
  }
}

export function currentLocale() {
  return savedLocale() ?? detectLocale(navigator.language)
}

interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(currentLocale)

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale: (next) => {
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Storage can be blocked; the choice then lasts until reload.
        }
        setLocaleState(next)
      },
      t: (key, params) => translate(locale, key, params),
    }),
    [locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return createElement(I18nContext.Provider, { value }, children)
}

function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useT needs an I18nProvider')
  return value
}

export function useT() {
  return useI18n().t
}

export function useLocale() {
  const { locale, setLocale } = useI18n()
  return { locale, setLocale }
}
