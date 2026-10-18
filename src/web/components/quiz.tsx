import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { api } from '@/web/lib/api'
import type { QuizAnswer, QuizMode, QuizQuestion } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'
import type { Scope } from '@/web/pages/review'

const MODES: { value: QuizMode; label: string }[] = [
  { value: 'choice', label: 'Multiple choice' },
  { value: 'typed', label: 'Type the answer' },
  { value: 'mixed', label: 'Mixed' },
]

const COUNTS = [5, 10, 20]

export function Quiz({ scope }: { scope: Scope }) {
  const [mode, setMode] = useState<QuizMode>('choice')
  const [count, setCount] = useState(10)
  const [round, setRound] = useState(0)

  if (!round) {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setRound(1)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-mode">Questions</Label>
            <NativeSelect
              id="quiz-mode"
              className="w-full"
              value={mode}
              onChange={(e) =>
                setMode(MODES.find((m) => m.value === e.target.value)?.value ?? 'choice')
              }
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-count">Length</Label>
            <NativeSelect
              id="quiz-count"
              className="w-full"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c} words
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full">
          Start quiz
        </Button>
      </form>
    )
  }

  return (
    <QuizRound
      key={round}
      scope={scope}
      mode={mode}
      count={count}
      round={round}
      onRetry={() => setRound((r) => r + 1)}
      onSetup={() => setRound(0)}
    />
  )
}

function QuizRound({
  scope,
  mode,
  count,
  round,
  onRetry,
  onSetup,
}: {
  scope: Scope
  mode: QuizMode
  count: number
  round: number
  onRetry: () => void
  onSetup: () => void
}) {
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<QuizAnswer & { answer: string }>()

  const quiz = useQuery({
    queryKey: ['quiz', scope, mode, count, round],
    queryFn: () =>
      api<{ questions: QuizQuestion[] }>(withQuery('/quiz', { ...scope, mode, count })),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const submit = useMutation({
    mutationFn: ({ question, answer }: { question: QuizQuestion; answer: string }) =>
      api<QuizAnswer>('/quiz/answer', {
        method: 'POST',
        json: {
          vocabId: question.vocabId,
          mode: question.mode,
          direction: question.direction,
          answer,
        },
      }),
    onSuccess: (data, { answer }) => {
      setResult({ ...data, answer })
      if (data.correct) setScore((s) => s + 1)
      void queryClient.invalidateQueries({ queryKey: ['vocab'] })
    },
    onError: (error) => toast.error(error.message),
  })

  if (quiz.isPending) return <p className="text-muted-foreground">Picking words…</p>
  if (quiz.error) return <p className="text-destructive">{quiz.error.message}</p>

  const questions = quiz.data.questions
  if (!questions.length) {
    return (
      <div className="space-y-3 py-6">
        <p className="font-heading text-2xl">No defined words here yet.</p>
        <p className="text-muted-foreground">
          The quiz only uses words that have a definition. Add definitions in the book’s Vocab tab,
          or ask Claude to fill them in through the Bookworm connector, for example “define the new
          words in my latest book”.
        </p>
        <Button variant="outline" onClick={onSetup}>
          Back
        </Button>
      </div>
    )
  }

  const question = questions.at(index)
  if (!question) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="font-heading text-4xl tabular-nums">
          {score} of {questions.length}
        </p>
        <p className="text-muted-foreground">
          {score === questions.length
            ? 'Every one right.'
            : 'Another round helps the missed ones stick.'}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={onSetup}>
            Change settings
          </Button>
          <Button onClick={onRetry}>New round</Button>
        </div>
      </div>
    )
  }

  function next() {
    setResult(undefined)
    setIndex((i) => i + 1)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        Question {index + 1} of {questions.length}, {score} right so far
      </p>
      <article
        key={index}
        className="animate-in space-y-4 rounded-2xl border border-l-4 border-l-vocab bg-card p-5 duration-200 fade-in-0 sm:p-7"
      >
        <p className="text-sm text-muted-foreground">
          {question.direction === 'definition' ? 'What does this mean?' : 'Which word fits?'}
        </p>
        <h2
          className={cn(
            'font-serif',
            question.direction === 'definition'
              ? 'text-3xl font-semibold sm:text-4xl'
              : 'text-xl/relaxed'
          )}
        >
          {question.prompt}
        </h2>
        {question.context && (
          <p className="border-l-2 pl-3 font-serif text-base/relaxed text-muted-foreground">
            {question.context}
          </p>
        )}
      </article>

      {question.mode === 'choice' && question.options ? (
        <Choices
          options={question.options}
          result={result}
          disabled={submit.isPending || !!result}
          onPick={(answer) => submit.mutate({ question, answer })}
        />
      ) : (
        <TypedAnswer
          key={index}
          disabled={submit.isPending || !!result}
          onSubmit={(answer) => submit.mutate({ question, answer })}
        />
      )}

      {result && (
        <div
          role="status"
          className={cn(
            'space-y-2 rounded-xl p-4',
            result.correct ? 'bg-lore/15' : 'bg-destructive/10'
          )}
        >
          <p className="flex items-center gap-2 font-medium">
            {result.correct ? (
              <Check aria-hidden className="size-5" />
            ) : (
              <X aria-hidden className="size-5" />
            )}
            {result.correct ? (result.close ? 'Close enough' : 'Correct') : 'Not quite'}
          </p>
          {(!result.correct || result.close) && (
            <p>
              <span className="text-muted-foreground">Answer: </span>
              <span className="font-serif text-lg">{result.expected}</span>
            </p>
          )}
          <Button className="w-full" size="lg" onClick={next} autoFocus>
            {index + 1 < questions.length ? 'Next' : 'See score'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Choices({
  options,
  result,
  disabled,
  onPick,
}: {
  options: string[]
  result?: QuizAnswer & { answer: string }
  disabled: boolean
  onPick: (answer: string) => void
}) {
  return (
    <ul className="space-y-2">
      {options.map((option) => {
        const isExpected = result && option === result.expected
        const isWrongPick = result && option === result.answer && !result.correct
        return (
          <li key={option}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(option)}
              className={cn(
                'flex min-h-12 w-full items-center rounded-xl border bg-card px-4 py-3 text-left transition-colors enabled:hover:bg-muted',
                isExpected && 'border-lore bg-lore/15',
                isWrongPick && 'border-destructive bg-destructive/10'
              )}
            >
              {option}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function TypedAnswer({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: (answer: string) => void
}) {
  const [value, setValue] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label="Your answer"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <Button type="submit" disabled={disabled || !value.trim()}>
        Check
      </Button>
    </form>
  )
}
