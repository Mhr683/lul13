// The questions this phone asked about products (Q&A on the product page). Only their ids are kept, so
// the store can tell the customer when the seller answers (src/components/QuestionAnswerNotifier.tsx).

const KEY = 'my_product_questions_v1';
const MAX = 30;

export interface MyQuestion {
  id: string;
  productId: string;
  askedAt: string;
  /** Set once the customer has seen the answer notice */
  seen?: boolean;
}

export function myQuestions(): MyQuestion[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((q) => q && typeof q.id === 'string') : [];
  } catch {
    return [];
  }
}

function save(list: MyQuestion[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage blocked: the answer still shows on the product page */
  }
}

export function rememberQuestion(id: string, productId: string) {
  save([...myQuestions().filter((q) => q.id !== id), { id, productId, askedAt: new Date().toISOString() }]);
}

export function markQuestionSeen(id: string) {
  save(myQuestions().map((q) => (q.id === id ? { ...q, seen: true } : q)));
}

/** Questions still worth checking (not seen yet; older than 60 days are dropped) */
export function questionsToCheck(): MyQuestion[] {
  const cutoff = Date.now() - 60 * 86400_000;
  return myQuestions().filter((q) => !q.seen && Date.parse(q.askedAt) > cutoff);
}

/** True while this phone has an unanswered / unseen question on the product (its list is re-read) */
export function hasOpenQuestionOn(productId: string) {
  return questionsToCheck().some((q) => q.productId === productId);
}
