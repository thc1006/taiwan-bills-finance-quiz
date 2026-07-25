import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import { QuizPage } from './pages/QuizPage';
import { ResultPage } from './pages/ResultPage';
import { useQuiz } from './hooks/useQuiz';
import { useAccessibility } from './hooks/useAccessibility';
import type { QuizConfig, QuizResult } from './types/quiz';
import './App.css';

type View = 'home' | 'quiz' | 'result';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [result, setResult] = useState<QuizResult | null>(null);
  const quiz = useQuiz();
  const a11y = useAccessibility();

  const handleStart = useCallback(
    (config: QuizConfig) => {
      const n = quiz.start(config);
      // 抽不到題就不要切到測驗頁 —— 那會是一個沒有任何題目的空白畫面。
      if (n > 0) setView('quiz');
    },
    [quiz]
  );

  const handleFinish = useCallback(() => {
    setResult(quiz.finish());
    setView('result');
  }, [quiz]);

  const handleAbort = useCallback(() => {
    quiz.abort();
    setView('home');
  }, [quiz]);

  const handleRetry = useCallback(() => {
    if (result) handleStart(result.config);
  }, [result, handleStart]);

  const handleReviewWrong = useCallback(() => {
    handleStart({
      mode: 'wrong',
      subject: 'all',
      questionCount: 50,
      tags: [],
      officialOnly: false,
      showAnswerImmediately: true,
    });
  }, [handleStart]);

  const handleSelect = useCallback(
    (key: 'A' | 'B' | 'C' | 'D') => {
      quiz.answer(key);
      // 模擬考不即時揭曉答案，作答後直接前進，節奏接近真實應試。
      if (!quiz.config.showAnswerImmediately) quiz.next();
    },
    [quiz]
  );

  const handleSkip = useCallback(() => {
    quiz.answer(null);
    quiz.next();
  }, [quiz]);

  return (
    <ErrorBoundary>
      <Header
        settings={a11y.settings}
        onCycleTheme={a11y.cycleTheme}
        onFontSize={(v) => a11y.update('fontSize', v)}
        onToggleContrast={() => a11y.update('highContrast', !a11y.settings.highContrast)}
        onHome={() => setView('home')}
        showHome={view !== 'home'}
      />
      <main className="wrap">
        {view === 'home' && <HomePage onStart={handleStart} />}
        {view === 'quiz' && (
          <QuizPage
            config={quiz.config}
            questions={quiz.questions}
            index={quiz.index}
            answers={quiz.answers}
            onSelect={handleSelect}
            onSkip={handleSkip}
            onNext={quiz.next}
            onPrev={quiz.prev}
            onGoTo={quiz.goTo}
            onFinish={handleFinish}
            onAbort={handleAbort}
          />
        )}
        {view === 'result' && result && (
          <ResultPage
            result={result}
            onRetry={handleRetry}
            onHome={() => setView('home')}
            onReviewWrong={handleReviewWrong}
          />
        )}
      </main>
    </ErrorBoundary>
  );
}
