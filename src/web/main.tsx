import './globals.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Link, RouterProvider } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { AppShell, RequireAuth } from './components/app-shell'
import { I18nProvider, useT } from './lib/i18n'
import { BookPage } from './pages/book'
import { ConsentPage } from './pages/consent'
import { LibraryPage } from './pages/library'
import { LoginPage } from './pages/login'
import { ReviewPage } from './pages/review'
import { SettingsPage } from './pages/settings'
import { SignupPage } from './pages/signup'
import { TriagePage } from './pages/triage'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

function NotFound() {
  const t = useT()
  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-3xl">{t('notFound.title')}</h1>
      <Link to="/" className="text-primary underline underline-offset-4">
        {t('common.backToLibrary')}
      </Link>
    </div>
  )
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/oauth/consent', element: <ConsentPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <LibraryPage /> },
          { path: '/books/:id', element: <BookPage /> },
          { path: '/triage', element: <TriagePage /> },
          { path: '/review', element: <ReviewPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>
)
