/* calculator.js — debtpayoffmath.com
 * Tools: ccPayoff · snowball · avalanche · consolidation · dti · loan · amortization · personalLoan · interest · payoff
 *
 * No external data: every figure comes from the user. Interest is charged monthly at APR ÷ 12. Credit cards
 * usually charge a daily rate on the average daily balance, so the card results are close estimates, and the
 * page says so. Minimum-payment formulas differ by issuer; the user enters their card's formula from the statement.
 */
(function (root, factory) {
  const C = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = C; else root.CALCS = C;
})(typeof self !== 'undefined' ? self : this, function () {
  const r2 = n => Math.round(n * 100) / 100;
  const CAP = 1200;   // 100 years: anything longer is reported as "never"

  const payment = (p, apr, n) => { const r = apr / 1200; return n <= 0 ? 0 : r === 0 ? p / n : p * r / (1 - Math.pow(1 + r, -n)); };
  // pays a balance down with payFn(balance, interest) each month; returns months, interest and yearly rows
  function run(balance, apr, payFn) {
    const r = apr / 1200; let months = 0, interest = 0; const rows = [];
    let yi = 0, yp = 0;
    while (balance > 0.005 && months < CAP) {
      const i = balance * r; interest += i; yi += i;
      const pay = Math.min(payFn(balance, i), balance + i);
      if (pay <= i) return { months: Infinity, interest: Infinity, rows };
      yp += pay - i;
      balance = balance + i - pay; months++;
      if (months % 12 === 0 || balance <= 0.005) { rows.push({ year: Math.ceil(months / 12), interest: yi, principal: yp, balance: Math.max(0, balance) }); yi = 0; yp = 0; }
    }
    return { months: balance > 0.005 ? Infinity : months, interest, rows };
  }
  const monthsText = m => !isFinite(m) ? 'never' : m < 12 ? `${m} month${m === 1 ? '' : 's'}` : `${Math.floor(m / 12)} yr ${m % 12} mo`;
  const neverWarning = ['This payment does not cover the monthly interest, so the balance never goes down. Raise the payment.'];

  const ccPayoff = {
    title: 'Credit card payoff calculator',
    inputs: [
      { id: 'balance', label: 'Card balance', type: 'number', prefix: '$', default: 5000, min: 0 },
      { id: 'apr', label: 'Card APR (from your statement)', type: 'number', suffix: '%', default: 22.99, min: 0, max: 40, step: 0.01 },
      { id: 'mode', label: 'I want to…', type: 'radio', default: 'fixed', options: [{ value: 'fixed', label: 'Pay a fixed amount' }, { value: 'months', label: 'Be debt-free by a deadline' }, { value: 'minimum', label: 'See minimum payments only' }] },
      { id: 'payment', label: 'Monthly payment', type: 'number', prefix: '$', default: 200, min: 0, showIf: s => s.mode === 'fixed' },
      { id: 'months', label: 'Months to pay it off', type: 'number', default: 24, min: 1, max: 360, showIf: s => s.mode === 'months' },
      { id: 'minPct', label: 'Minimum payment: % of balance (from your card agreement)', type: 'number', suffix: '%', default: 1, min: 0, max: 10, step: 0.1, showIf: s => s.mode === 'minimum' },
      { id: 'minPlusInterest', label: '…plus that month’s interest', type: 'checkbox', default: true, showIf: s => s.mode === 'minimum' },
      { id: 'minFloor', label: 'Minimum payment floor', type: 'number', prefix: '$', default: 35, min: 0, showIf: s => s.mode === 'minimum' },
    ],
    compute(v, fmt) {
      const b = v.balance || 0, apr = v.apr || 0;
      if (v.mode === 'months') {
        const p = payment(b, apr, v.months || 1);
        return { raw: { payment: r2(p), interest: r2(p * v.months - b) },
          summary: [{ label: `Pay each month to be debt-free in ${v.months} months`, value: fmt.money(p), strong: true }, { label: 'Total interest', value: fmt.money0(p * v.months - b) }] };
      }
      const res = v.mode === 'minimum'
        ? run(b, apr, (bal, i) => Math.max(v.minFloor || 0, bal * (v.minPct || 0) / 100 + (v.minPlusInterest ? i : 0)))
        : run(b, apr, () => v.payment || 0);
      if (!isFinite(res.months)) return { warnings: neverWarning, raw: { months: null } };
      return {
        raw: { months: res.months, interest: r2(res.interest) },
        summary: [{ label: 'Debt-free in', value: monthsText(res.months), strong: true }, { label: 'Total interest', value: fmt.money0(res.interest) }, { label: 'Total paid', value: fmt.money0(b + res.interest) }],
        rows: res.rows.map(r => ({ label: `End of year ${r.year}`, value: `${fmt.money0(r.balance)} left · ${fmt.money0(r.interest)} interest that year` })),
        notes: ['Estimate: interest is charged monthly at APR ÷ 12 with no new purchases. Card issuers charge a daily rate, so your statement will differ slightly.'],
      };
    },
  };

  // snowball / avalanche engine — freed-up minimums roll into the target debt
  function plan(debts, extra, order) {
    const ds = debts.map(d => ({ ...d }));
    const idx = ds.map((_, k) => k);
    const seq = order === 'snowball'
      ? idx.sort((a, b) => (ds[a].balance - ds[b].balance) || (a - b))
      : idx.sort((a, b) => (ds[b].apr - ds[a].apr) || (a - b));
    const budget = ds.reduce((s, d) => s + d.min, 0) + extra;
    let months = 0, interest = 0; const done = {};
    while (ds.some(d => d.balance > 0.005) && months < CAP) {
      months++;
      let owedInterest = 0;
      for (const d of ds) if (d.balance > 0.005) { const i = d.balance * d.apr / 1200; interest += i; owedInterest += i; d.balance += i; }
      let left = budget;
      for (const d of ds) if (d.balance > 0.005) { const p = Math.min(d.min, d.balance); d.balance -= p; left -= p; }
      for (const k of seq) { if (left <= 0) break; const d = ds[k]; if (d.balance > 0.005) { const p = Math.min(left, d.balance); d.balance -= p; left -= p; } }
      ds.forEach((d, k) => { if (d.balance <= 0.005 && done[k] == null) done[k] = months; });
      if (months === 1 && budget <= owedInterest) return { months: Infinity, interest: Infinity, done: {}, seq };
    }
    return { months: ds.some(d => d.balance > 0.005) ? Infinity : months, interest, done, seq };
  }
  const cleanDebts = list => (list || []).filter(d => d && (d.balance || 0) > 0).map((d, k) => ({ name: d.name || `Debt ${k + 1}`, balance: d.balance || 0, apr: d.apr || 0, min: d.min || 0 }));
  const debtColumns = [{ id: 'name', label: 'Debt name' }, { id: 'balance', label: 'Balance $', type: 'number' }, { id: 'apr', label: 'APR %', type: 'number' }, { id: 'min', label: 'Minimum $', type: 'number' }];
  const sampleDebts = [{ name: 'Card A', balance: 1000, apr: 18, min: 25 }, { name: 'Card B', balance: 2500, apr: 24, min: 60 }, { name: 'Car loan', balance: 6000, apr: 7, min: 120 }];

  function strategy(order, title) {
    return {
      title,
      inputs: [
        { id: 'debts', label: 'Your debts', type: 'repeater', addLabel: '+ Add a debt', default: sampleDebts, columns: debtColumns },
        { id: 'extra', label: 'Extra you can pay each month on top of the minimums', type: 'number', prefix: '$', default: 200, min: 0 },
      ],
      compute(v, fmt) {
        const debts = cleanDebts(v.debts);
        if (!debts.length) return { warnings: ['Add at least one debt with a balance.'] };
        const res = plan(debts, v.extra || 0, order);
        if (!isFinite(res.months)) return { warnings: ['Your payments do not cover the interest on these debts. Raise the extra payment.'], raw: { months: null } };
        const other = plan(debts, v.extra || 0, order === 'snowball' ? 'avalanche' : 'snowball');
        let minOnly = 0, minMonths = 0;
        for (const d of debts) { const r = run(d.balance, d.apr, () => d.min); minOnly += r.interest; minMonths = Math.max(minMonths, r.months); }
        const raw = { months: res.months, interest: r2(res.interest), otherInterest: r2(other.interest), minimumsInterest: isFinite(minOnly) ? r2(minOnly) : null, minimumsMonths: isFinite(minMonths) ? minMonths : null };
        debts.forEach((d, k) => { raw[`done${k + 1}`] = res.done[k]; });
        return {
          raw,
          summary: [
            { label: 'Debt-free in', value: monthsText(res.months), strong: true },
            { label: 'Total interest', value: fmt.money0(res.interest) },
            { label: isFinite(minOnly) ? 'Interest saved vs paying only minimums' : 'Paying only minimums', value: isFinite(minOnly) ? fmt.money0(minOnly - res.interest) : 'never pays off' },
            { label: `The ${order === 'snowball' ? 'avalanche (highest rate first)' : 'snowball (smallest balance first)'} method would cost`, value: fmt.money0(other.interest) },
          ],
          rows: res.seq.map((k, n) => ({ label: `${n + 1}. ${debts[k].name}`, value: `paid off in month ${res.done[k]}` })),
          notes: [`${order === 'snowball' ? 'Snowball: the smallest balance gets every spare dollar first.' : 'Avalanche: the highest APR gets every spare dollar first.'} When a debt is gone, its minimum rolls into the next one, so your total monthly payment stays the same. Interest is estimated monthly at APR ÷ 12.`],
        };
      },
    };
  }
  const snowball = strategy('snowball', 'Debt snowball calculator');
  const avalanche = strategy('avalanche', 'Debt avalanche calculator');

  const consolidation = {
    title: 'Debt consolidation calculator',
    inputs: [
      { id: 'debts', label: 'Debts you would consolidate', type: 'repeater', addLabel: '+ Add a debt', default: [{ name: 'Card A', balance: 4000, apr: 24.99, pay: 150 }, { name: 'Card B', balance: 3000, apr: 19.99, pay: 100 }],
        columns: [{ id: 'name', label: 'Debt name' }, { id: 'balance', label: 'Balance $', type: 'number' }, { id: 'apr', label: 'APR %', type: 'number' }, { id: 'pay', label: 'You pay $/month', type: 'number' }] },
      { id: 'apr', label: 'Consolidation loan APR offered', type: 'number', suffix: '%', default: 11.5, min: 0, max: 40, step: 0.01 },
      { id: 'months', label: 'Consolidation loan term (months)', type: 'number', default: 36, min: 6, max: 120 },
      { id: 'feePct', label: 'Origination fee (taken out of the loan)', type: 'number', suffix: '%', default: 5, min: 0, max: 12, step: 0.1 },
    ],
    compute(v, fmt) {
      const debts = (v.debts || []).filter(d => d && d.balance > 0);
      if (!debts.length) return { warnings: ['Add the debts you want to combine.'] };
      const total = debts.reduce((s, d) => s + d.balance, 0);
      let curInterest = 0, curMonths = 0, curPay = 0;
      for (const d of debts) { const r = run(d.balance, d.apr || 0, () => d.pay || 0); curInterest += r.interest; curMonths = Math.max(curMonths, r.months); curPay += d.pay || 0; }
      const principal = total / (1 - (v.feePct || 0) / 100);
      const p = payment(principal, v.apr || 0, v.months || 1);
      const newCost = p * v.months - total;
      const warnings = isFinite(curInterest) ? [] : ['At least one of your current payments does not cover its interest, so the current plan never ends.'];
      const saved = curInterest - newCost;
      return {
        raw: { currentMonths: isFinite(curMonths) ? curMonths : null, currentInterest: isFinite(curInterest) ? r2(curInterest) : null, principal: r2(principal), payment: r2(p), newCost: r2(newCost), saved: isFinite(saved) ? r2(saved) : null },
        warnings,
        summary: [
          { label: saved >= 0 ? 'Consolidating saves you' : 'Consolidating costs you more by', value: isFinite(saved) ? fmt.money0(Math.abs(saved)) : '—', strong: true },
          { label: 'New monthly payment', value: `${fmt.money(p)} (now ${fmt.money(curPay)})` },
          { label: 'Debt-free', value: `${v.months} months (now ${monthsText(curMonths)})` },
        ],
        rows: [{ label: 'Loan you must borrow to receive the full payoff amount', value: fmt.money(principal) }, { label: 'New loan interest + fee', value: fmt.money0(newCost) }, { label: 'Interest on your current plan', value: isFinite(curInterest) ? fmt.money0(curInterest) : 'never ends' }],
        notes: ['Consolidation only saves money if you stop adding to the old cards. Compare the loan’s APR (which includes the fee), not just its interest rate.'],
      };
    },
  };

  const dti = {
    title: 'Debt-to-income ratio calculator',
    inputs: [
      { id: 'income', label: 'Gross monthly income (before tax)', type: 'number', prefix: '$', default: 6000, min: 0 },
      { id: 'housing', label: 'Rent or mortgage payment (with property tax, insurance, HOA)', type: 'number', prefix: '$', default: 1500, min: 0 },
      { id: 'car', label: 'Car loan payments', type: 'number', prefix: '$', default: 350, min: 0 },
      { id: 'student', label: 'Student loan payments', type: 'number', prefix: '$', default: 200, min: 0 },
      { id: 'cards', label: 'Credit card minimum payments', type: 'number', prefix: '$', default: 100, min: 0 },
      { id: 'other', label: 'Other debt payments (personal loans, child support)', type: 'number', prefix: '$', default: 0, min: 0 },
    ],
    compute(v, fmt) {
      const inc = v.income || 0;
      if (!inc) return { warnings: ['Enter your gross monthly income.'] };
      const debts = (v.housing || 0) + (v.car || 0) + (v.student || 0) + (v.cards || 0) + (v.other || 0);
      return {
        raw: { front: r2((v.housing || 0) / inc * 100), back: r2(debts / inc * 100) },
        summary: [{ label: 'Debt-to-income ratio', value: fmt.pct(debts / inc * 100), strong: true }, { label: 'Housing-only ratio', value: fmt.pct((v.housing || 0) / inc * 100) }, { label: 'Monthly debt payments', value: fmt.money0(debts) }],
        notes: ['DTI = monthly debt payments ÷ gross monthly income. Lenders set their own limits for each loan type — ask yours. Everyday bills such as utilities and groceries are not counted.'],
      };
    },
  };

  const loan = {
    title: 'Loan calculator',
    inputs: [
      { id: 'solve', label: 'Find the…', type: 'radio', default: 'payment', options: [{ value: 'payment', label: 'Monthly payment' }, { value: 'amount', label: 'Amount I can borrow' }, { value: 'term', label: 'Time to pay off' }] },
      { id: 'amount', label: 'Loan amount', type: 'number', prefix: '$', default: 25000, min: 0, showIf: s => s.solve !== 'amount' },
      { id: 'payment', label: 'Monthly payment', type: 'number', prefix: '$', default: 500, min: 0, showIf: s => s.solve !== 'payment' },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 8, min: 0, max: 40, step: 0.01 },
      { id: 'months', label: 'Term (months)', type: 'number', default: 60, min: 1, max: 480, showIf: s => s.solve !== 'term' },
    ],
    compute(v, fmt) {
      const apr = v.apr || 0, r = apr / 1200;
      if (v.solve === 'amount') {
        const a = r ? (v.payment || 0) * (1 - Math.pow(1 + r, -(v.months || 1))) / r : (v.payment || 0) * (v.months || 1);
        return { raw: { amount: r2(a) }, summary: [{ label: 'You can borrow', value: fmt.money0(a), strong: true }, { label: 'Total interest', value: fmt.money0((v.payment || 0) * v.months - a) }] };
      }
      if (v.solve === 'term') {
        const res = run(v.amount || 0, apr, () => v.payment || 0);
        if (!isFinite(res.months)) return { warnings: neverWarning, raw: { months: null } };
        return { raw: { months: res.months, interest: r2(res.interest) }, summary: [{ label: 'Paid off in', value: monthsText(res.months), strong: true }, { label: 'Total interest', value: fmt.money0(res.interest) }] };
      }
      const p = payment(v.amount || 0, apr, v.months || 1);
      return { raw: { payment: r2(p), interest: r2(p * v.months - (v.amount || 0)) },
        summary: [{ label: 'Monthly payment', value: fmt.money(p), strong: true }, { label: 'Total interest', value: fmt.money0(p * v.months - (v.amount || 0)) }, { label: 'Total of payments', value: fmt.money0(p * v.months) }] };
    },
  };

  const amortization = {
    title: 'Amortization schedule calculator',
    inputs: [
      { id: 'amount', label: 'Loan amount', type: 'number', prefix: '$', default: 200000, min: 0 },
      { id: 'apr', label: 'Interest rate', type: 'number', suffix: '%', default: 6, min: 0, max: 40, step: 0.001 },
      { id: 'months', label: 'Term (months)', type: 'number', default: 360, min: 1, max: 480 },
      { id: 'extra', label: 'Extra principal each month', type: 'number', prefix: '$', default: 0, min: 0 },
    ],
    compute(v, fmt) {
      const p = payment(v.amount || 0, v.apr || 0, v.months || 1);
      const res = run(v.amount || 0, v.apr || 0, () => p + (v.extra || 0));
      const y1 = res.rows[0] || { interest: 0, principal: 0, balance: 0 };
      return {
        raw: { payment: r2(p), interest: r2(res.interest), months: res.months, y1Interest: r2(y1.interest), y1Principal: r2(y1.principal), y1Balance: r2(y1.balance) },
        summary: [{ label: 'Monthly payment', value: fmt.money(p + (v.extra || 0)), strong: true }, { label: 'Total interest', value: fmt.money0(res.interest) }, { label: 'Paid off in', value: monthsText(res.months) }],
        rows: res.rows.map(r => ({ label: `Year ${r.year}`, value: `principal ${fmt.money0(r.principal)} · interest ${fmt.money0(r.interest)} · balance ${fmt.money0(r.balance)}` })),
        notes: ['Principal and interest only; taxes, insurance and fees are not included.'],
      };
    },
  };

  // APR that makes the payments worth what you actually receive (bisection; payments are fixed)
  function trueApr(net, pmt, n) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2, m = mid / 12;
      const pv = pmt * (1 - Math.pow(1 + m, -n)) / m;
      if (pv > net) lo = mid; else hi = mid;
    }
    return lo * 100;
  }

  const personalLoan = {
    title: 'Personal loan calculator',
    inputs: [
      { id: 'amount', label: 'Loan amount', type: 'number', prefix: '$', default: 10000, min: 0 },
      { id: 'rate', label: 'Interest rate', type: 'number', suffix: '%', default: 12, min: 0, max: 40, step: 0.01 },
      { id: 'months', label: 'Term', type: 'select', default: '36', options: ['12', '24', '36', '48', '60', '72', '84'].map(m => ({ value: m, label: `${m} months` })) },
      { id: 'feePct', label: 'Origination fee (taken out of the loan)', type: 'number', suffix: '%', default: 5, min: 0, max: 12, step: 0.1 },
    ],
    compute(v, fmt) {
      const n = Number(v.months), amt = v.amount || 0;
      const p = payment(amt, v.rate || 0, n);
      const net = amt * (1 - (v.feePct || 0) / 100);
      const apr = (v.feePct || 0) > 0 ? trueApr(net, p, n) : (v.rate || 0);
      return {
        raw: { payment: r2(p), net: r2(net), apr: r2(apr), cost: r2(p * n - net) },
        summary: [{ label: 'Monthly payment', value: fmt.money(p), strong: true }, { label: 'Money you receive', value: fmt.money0(net) }, { label: 'APR including the fee', value: `${r2(apr)}%` }, { label: 'Total cost of borrowing', value: fmt.money0(p * n - net) }],
        notes: ['If you need the full amount in hand, borrow amount ÷ (1 − fee%). Lenders must show the APR before you sign — compare that figure.'],
      };
    },
  };

  const interest = {
    title: 'Interest calculator',
    inputs: [
      { id: 'principal', label: 'Starting amount', type: 'number', prefix: '$', default: 10000, min: 0 },
      { id: 'rate', label: 'Annual interest rate', type: 'number', suffix: '%', default: 5, min: 0, max: 100, step: 0.001 },
      { id: 'years', label: 'Years', type: 'number', default: 3, min: 0, max: 100, step: 0.25 },
      { id: 'type', label: 'Interest type', type: 'select', default: 'monthly', options: [{ value: 'simple', label: 'Simple interest' }, { value: 'annual', label: 'Compounded yearly' }, { value: 'monthly', label: 'Compounded monthly' }, { value: 'daily', label: 'Compounded daily (365)' }] },
    ],
    compute(v, fmt) {
      const P = v.principal || 0, r = (v.rate || 0) / 100, t = v.years || 0;
      const per = { annual: 1, monthly: 12, daily: 365 }[v.type];
      const end = v.type === 'simple' ? P * (1 + r * t) : P * Math.pow(1 + r / per, per * t);
      const apy = v.type === 'simple' ? r * 100 : (Math.pow(1 + r / per, per) - 1) * 100;
      return {
        raw: { interest: r2(end - P), total: r2(end) },
        summary: [{ label: 'Interest earned or owed', value: fmt.money(end - P), strong: true }, { label: 'Ending balance', value: fmt.money(end) }, { label: v.type === 'simple' ? 'Rate' : 'Effective annual rate (APY)', value: `${Math.round(apy * 1000) / 1000}%` }],
      };
    },
  };

  const payoff = {
    title: 'Debt payoff calculator',
    inputs: [
      { id: 'balance', label: 'Balance owed', type: 'number', prefix: '$', default: 15000, min: 0 },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 9, min: 0, max: 40, step: 0.01 },
      { id: 'payment', label: 'Current monthly payment', type: 'number', prefix: '$', default: 300, min: 0 },
      { id: 'extra', label: 'Extra each month', type: 'number', prefix: '$', default: 100, min: 0 },
      { id: 'lump', label: 'One-time payment now', type: 'number', prefix: '$', default: 1000, min: 0 },
      { id: 'target', label: 'Or: months to be debt-free (blank to skip)', type: 'number', default: 24, min: 1, max: 480 },
    ],
    compute(v, fmt) {
      const base = run(v.balance || 0, v.apr || 0, () => v.payment || 0);
      const fast = run(Math.max(0, (v.balance || 0) - (v.lump || 0)), v.apr || 0, () => (v.payment || 0) + (v.extra || 0));
      if (!isFinite(fast.months)) return { warnings: neverWarning, raw: { months: null } };
      const need = v.target ? payment(v.balance || 0, v.apr || 0, v.target) : null;
      return {
        raw: { months: isFinite(base.months) ? base.months : null, interest: isFinite(base.interest) ? r2(base.interest) : null, fastMonths: fast.months, fastInterest: r2(fast.interest), target: need == null ? null : r2(need) },
        summary: [
          { label: 'Debt-free with your extra payments', value: monthsText(fast.months), strong: true },
          { label: 'Interest saved', value: isFinite(base.interest) ? fmt.money0(base.interest - fast.interest) : 'your current payment never pays it off' },
          { label: 'Time saved', value: isFinite(base.months) ? monthsText(base.months - fast.months) : '—' },
          ...(need != null ? [{ label: `Payment to finish in ${v.target} months (no lump sum)`, value: fmt.money(need) }] : []),
        ],
        notes: ['Ask your lender to apply extra payments to principal, and check for prepayment penalties.'],
      };
    },
  };

  return {
    ccPayoff, snowball, avalanche, consolidation, dti, loan, amortization, personalLoan, interest, payoff,
    __pure: { payment, run, plan, trueApr },
    // Expected values: build/tests/debt_expected.py
    __tests: [
      { calc: 'ccPayoff', name: '$5,000 at 22.99% paying $200 → 35 months, $1,871 interest', input: { mode: 'fixed' }, expect: { months: 35, interest: 1871.08 } },
      { calc: 'ccPayoff', name: 'debt-free in 24 months → $261.84/month', input: { mode: 'months', months: 24 }, expect: { payment: 261.84, interest: 1284.2 } },
      { calc: 'ccPayoff', name: 'minimum 1% + interest, $35 floor → 199 months, $8,053', input: { mode: 'minimum' }, expect: { months: 199, interest: 8052.95 } },
      { calc: 'snowball', name: 'snowball, 3 debts + $200 → 27 months, $1,171.66; paid off months 5/15/27', input: {}, expect: { months: 27, interest: 1171.66, done1: 5, done2: 15, done3: 27, otherInterest: 1115.15, minimumsInterest: 4582.22, minimumsMonths: 91 } },
      { calc: 'avalanche', name: 'avalanche, same debts → $1,115.15; paid off months 14/11/27', input: {}, expect: { months: 27, interest: 1115.15, done1: 14, done2: 11, done3: 27 } },
      { calc: 'snowball', name: 'one debt behaves like a plain payoff', input: { debts: [{ name: 'Card', balance: 5000, apr: 22.99, min: 150 }], extra: 50 }, expect: { months: 35, interest: 1871.08 } },
      { calc: 'consolidation', name: '$7,000 of cards into 11.5% × 36 with a 5% fee → saves $1,343.58', input: {}, expect: { currentMonths: 42, currentInterest: 3090.9, principal: 7368.42, payment: 242.98, newCost: 1747.32, saved: 1343.58 } },
      { calc: 'dti', name: '$6,000 income, $1,500 housing, $650 other → 25% / 35.83%', input: { car: 350, student: 200, cards: 100, other: 0 }, expect: { front: 25, back: 35.83 } },
      { calc: 'loan', name: '$25,000 at 8% for 60 months → $506.91', input: { solve: 'payment' }, expect: { payment: 506.91, interest: 5414.59 } },
      { calc: 'loan', name: '$500/month at 8% for 60 months → borrow $24,659.22', input: { solve: 'amount' }, expect: { amount: 24659.22 } },
      { calc: 'loan', name: '$25,000 at 8% paying $500 → 62 months', input: { solve: 'term' }, expect: { months: 62 } },
      { calc: 'amortization', name: '$200,000 at 6% for 30 years → $1,199.10; year 1 interest $11,933.19', input: {}, expect: { payment: 1199.1, interest: 231676.38, months: 360, y1Interest: 11933.19, y1Principal: 2456.02, y1Balance: 197543.98 } },
      { calc: 'amortization', name: '+$100/month extra → 295 months, $182,537.97 interest', input: { extra: 100 }, expect: { months: 295, interest: 182537.97 } },
      { calc: 'personalLoan', name: '$10,000 at 12% × 36 with 5% fee → $332.14, APR 15.61%', input: {}, expect: { payment: 332.14, net: 9500, apr: 15.61, cost: 2457.15 } },
      { calc: 'interest', name: '$10,000 at 5% for 3 years: simple $1,500', input: { type: 'simple' }, expect: { interest: 1500 } },
      { calc: 'interest', name: 'monthly $1,614.72 · yearly $1,576.25 · daily $1,618.22', input: { type: 'monthly' }, expect: { interest: 1614.72 } },
      { calc: 'interest', name: 'compounded yearly', input: { type: 'annual' }, expect: { interest: 1576.25 } },
      { calc: 'interest', name: 'compounded daily', input: { type: 'daily' }, expect: { interest: 1618.22 } },
      { calc: 'payoff', name: '$15,000 at 9%: $300 → 63 months; $1,000 lump + $100 extra → 41 months', input: {}, expect: { months: 63, interest: 3870.66, fastMonths: 41, fastInterest: 2300.53, target: 685.27 } },
    ],
  };
});
