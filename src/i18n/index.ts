import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ru } from './ru'
import { en } from './en'
import { ar } from './ar'
import type { Dict } from './ru'

export type Lang = 'ru' | 'en' | 'ar'

const dicts: Record<Lang, Dict> = { ru, en, ar }

const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

export function convertNumbers(text: string, lang: Lang): string {
  if (lang !== 'ar') return text
  return text.replace(/[0-9]/g, (d) => arabicIndic[Number(d)])
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: 'ru',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'lang' },
  ),
)

export function useI18n(): { t: Dict; lang: Lang; setLang: (l: Lang) => void; n: (s: string) => string } {
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  const t = dicts[lang]
  const n = (s: string) => convertNumbers(s, lang)
  return { t, lang, setLang, n }
}

export function currentLang(): Lang {
  return useI18nStore.getState().lang
}

export function currentDict(): Dict {
  return dicts[useI18nStore.getState().lang]
}
