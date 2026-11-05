import { auth, db, provider } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile, EmailAuthProvider, linkWithCredential,
  signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
let currentUser = null, incomes = [], expenses = [], legacyDays = [], internalTransfers = [], editingIncomeId = null, editingExpenseId = null, monthlyCalculated = false;
        const $ = id => document.getElementById(id);

        function setupNavigation() {
            const buttons = [...document.querySelectorAll('.nav-btn[data-screen]')];
            let switching = false;
            function showScreen(id) {
                if (switching || !document.getElementById(id)) return;
                switching = true;
                const overlay = $('screenTransition'); overlay.classList.add('show');
                setTimeout(() => {
                    document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
                    buttons.forEach(button => button.classList.toggle('active', button.dataset.screen === id));
                    window.scrollTo({ top: 0, behavior: 'instant' });
                    setTimeout(() => { overlay.classList.remove('show'); switching = false; }, 120);
                }, 260);
            }
            buttons.forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
            document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.go)));
        }
        setupNavigation();
        function hideSplash() { $('splashScreen').classList.add('is-hidden'); }


        const localDateString = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const todayKey = () => localDateString(new Date());
        const money = n => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(n) || 0);
        const safeNum = el => Math.max(0, Number(el.value) || 0);
        let toastTimer = null;
        function toast(message, type = '') { const el = $('toast'); el.textContent = message; el.className = type; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
        function friendlyError(e) { const c=e?.code||''; return ({'auth/email-already-in-use':'An account already exists with this email. Try logging in.','auth/invalid-email':'Enter a valid email address.','auth/weak-password':'Choose a stronger password with at least 6 characters.','auth/user-not-found':'No account found with that email.','auth/wrong-password':'Incorrect email or password.','auth/invalid-credential':'Incorrect email or password.','auth/too-many-requests':'Too many attempts. Please wait a little and try again.','auth/operation-not-allowed':'Email and password sign-in has not been enabled in Firebase yet.','auth/popup-blocked':'Your browser blocked the Google sign-in window. Try again or use email login.','auth/network-request-failed':'Network problem. Check your internet connection.','auth/provider-already-linked':'This account already has email and password sign-in enabled.','auth/credential-already-in-use':'This email/password is already linked to another account. Sign in to that account instead.','auth/email-already-in-use':'This email is already connected to another account. No changes were made to your current account.','auth/requires-recent-login':'For security, sign out and sign in with Google again, then retry.'})[c] || 'Something went wrong. Please try again.'; }
        function setStatus(m, t = '') { if (/failed|could not|error/i.test(m)) toast(/security rules|Firebase|cloud records/i.test(m) ? 'Could not load your records. Please try again later.' : m.replace(/Details:.*/i,'').replace(/Save failed:.*/i,'Please try again.'), 'error'); else if (/saved|deleted|updated/i.test(m)) toast(m.replace(/Internal transfer saved.*/i,'Transfer completed successfully.')); }
        function setLoginStatus(m, t = '') { if (m && /failed|error/i.test(m)) toast(m.replace(/Sign-in failed:.*/i,'Sign-in failed. Please try again.'), 'error'); }
        function showLoggedIn(u) { $('loginCard').classList.add('hidden'); $('app').classList.remove('hidden'); $('userArea').classList.remove('hidden'); $('displayName').textContent = u.displayName || 'Your Cash Log'; $('userEmail').textContent = u.displayName || 'Signed in'; }
        function showLoggedOut() { $('loginCard').classList.remove('hidden'); $('app').classList.add('hidden'); $('userArea').classList.add('hidden') }
        function isEmailPasswordUser(user) { return !!user?.providerData?.some(p => p.providerId === 'password'); }
        function showVerification(user) { $('loginCard').classList.add('hidden'); $('app').classList.add('hidden'); $('verifyCard').classList.remove('hidden'); $('verifyEmail').textContent = user?.email || 'your email address'; }
        $('resendVerificationBtn').addEventListener('click', async () => { try { if (!auth.currentUser) throw new Error('Please sign in again.'); await sendEmailVerification(auth.currentUser); toast('Verification email sent again.'); } catch(e) { toast(friendlyError(e),'error'); } });
        $('checkVerificationBtn').addEventListener('click', async () => { try { if (!auth.currentUser) { toast('Please sign in again.','error'); return; } await auth.currentUser.reload(); const user = auth.currentUser; if (user.emailVerified) { $('verifyCard').classList.add('hidden'); currentUser=user; showLoggedIn(user); await loadRecords(); toast('Email verified. Welcome to Cashlog.'); } else { toast('Your email is not verified yet. Open the link in your inbox first.','error'); } } catch(e) { toast(friendlyError(e),'error'); } });

        let authMode = 'login';
        function setAuthMode(mode) { authMode=mode; const creating=mode==='signup'; $('authTitle').textContent=creating?'Create your account':'Welcome back'; $('nameField').classList.toggle('hidden',!creating); $('authName').required=creating; $('authPassword').autocomplete=creating?'new-password':'current-password'; $('emailSubmitBtn').textContent=creating?'Create account':'Log in'; $('authModeBtn').textContent=creating?'Already have an account? Log in':'New here? Create an account'; $('forgotPasswordBtn').classList.toggle('hidden',creating); }
        $('authModeBtn').addEventListener('click',()=>setAuthMode(authMode==='login'?'signup':'login'));
        $('showPassword').addEventListener('change',()=>{$('authPassword').type=$('showPassword').checked?'text':'password'});
        $('emailAuthForm').addEventListener('submit',async ev=>{ev.preventDefault(); const email=$('authEmail').value.trim(), password=$('authPassword').value, name=$('authName').value.trim(); const btn=$('emailSubmitBtn'); btn.disabled=true; try { if(authMode==='signup'){ if(!name){toast('Enter your name to create an account.','error');return;} const cred=await createUserWithEmailAndPassword(auth,email,password); await updateProfile(cred.user,{displayName:name}); await sendEmailVerification(cred.user); showVerification(cred.user); toast('Verification email sent. Check your inbox.'); } else { await signInWithEmailAndPassword(auth,email,password); } } catch(e){toast(friendlyError(e),'error');} finally{btn.disabled=false;} });
        $('forgotPasswordBtn').addEventListener('click',async()=>{const email=$('authEmail').value.trim(); if(!email){toast('Enter your email address first.','error');return;} try{await sendPasswordResetEmail(auth,email);toast('Password reset email sent. Check your inbox.');}catch(e){toast(friendlyError(e),'error');}});
        setAuthMode('login');
        function refreshPasswordLinkUI(user) {
            const hasPassword = !!user?.providerData?.some(p => p.providerId === 'password');
            const isGoogle = !!user?.providerData?.some(p => p.providerId === 'google.com');
            // Only show the setup button for Google users who do not yet have a password.
            // Once email/password is linked, hide the button completely.
            $('accountPasswordBtn').classList.toggle('hidden', !user || hasPassword || !isGoogle);
            if (hasPassword) {
                $('accountPasswordPanel').classList.add('hidden');
                $('accountPasswordBtn').disabled = false;
            } else {
                $('accountPasswordBtn').disabled = false;
                $('accountPasswordBtn').textContent = 'Set up password';
            }
        }
        $('accountPasswordBtn').addEventListener('click', () => $('accountPasswordPanel').classList.toggle('hidden'));
        $('cancelLinkPassword').addEventListener('click', () => { $('accountPasswordPanel').classList.add('hidden'); $('linkPasswordForm').reset(); $('linkPassword').type = 'password'; $('linkPasswordConfirm').type = 'password'; });
        $('showLinkPassword').addEventListener('change', () => { const type = $('showLinkPassword').checked ? 'text' : 'password'; $('linkPassword').type = type; $('linkPasswordConfirm').type = type; });
        $('linkPasswordForm').addEventListener('submit', async ev => {
            ev.preventDefault();
            if (!auth.currentUser || !currentUser) { toast('Please sign in with Google again.','error'); return; }
            const password = $('linkPassword').value, confirmation = $('linkPasswordConfirm').value;
            if (password.length < 6) { toast('Choose a password with at least 6 characters.','error'); return; }
            if (password !== confirmation) { toast('The passwords do not match.','error'); return; }
            if (!currentUser.email) { toast('This Google account has no email address available.','error'); return; }
            const btn = $('linkPasswordSubmit'); btn.disabled = true;
            try {
                const credential = EmailAuthProvider.credential(currentUser.email, password);
                const result = await linkWithCredential(auth.currentUser, credential);
                currentUser = result.user;
                await result.user.reload();
                currentUser = auth.currentUser;
                refreshPasswordLinkUI(currentUser);
                $('accountPasswordPanel').classList.add('hidden');
                $('linkPasswordForm').reset();
                toast('Password added to your existing account. You can now sign in with Google or email and password.');
            } catch (e) { console.error(e); toast(friendlyError(e),'error'); }
            finally { btn.disabled = false; }
        });
        function incomeTotal(r) { return (Number(r.cash) || 0) + (Number(r.transfer) || 0) }
        function allIncomeRows() { return [...legacyDays.map(r => ({ ...r, kind: 'legacy', id: r.id || r.date, amount: incomeTotal(r) })), ...incomes.map(r => ({ ...r, kind: 'income', amount: incomeTotal(r) }))] }
        function todayIncome() { return allIncomeRows().filter(r => r.date === todayKey()) }
        function todayExpense() { return expenses.filter(r => r.date === todayKey()) }
        function monthBalances(month, throughDate) {
            const rows = allIncomeRows().filter(r => r.date.startsWith(month) && r.date <= throughDate);
            const monthExpenses = expenses.filter(r => r.date.startsWith(month) && r.date <= throughDate);
            const monthTransfers = internalTransfers.filter(r => r.date.startsWith(month) && r.date <= throughDate);
            const cashIn = rows.reduce((sum, r) => sum + (Number(r.cash) || 0), 0);
            const bankIn = rows.reduce((sum, r) => sum + (Number(r.transfer) || 0), 0);
            const cashOut = monthExpenses.filter(r => r.source === 'cash').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const bankOut = monthExpenses.filter(r => r.source === 'transfer').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const unknownOut = monthExpenses.filter(r => !['cash', 'transfer'].includes(r.source)).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const cashToBank = monthTransfers.filter(r => r.direction === 'cashToBank').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const bankToCash = monthTransfers.filter(r => r.direction === 'bankToCash').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            return { cash: cashIn - cashOut - cashToBank + bankToCash, bank: bankIn - bankOut + cashToBank - bankToCash, total: cashIn + bankIn - cashOut - bankOut - unknownOut, cashIn, bankIn };
        }
        function updateToday() {
            const rows = todayIncome();
            $('todayCashStat').textContent = money(rows.reduce((s, r) => s + (Number(r.cash) || 0), 0));
            $('todayTransferStat').textContent = money(rows.reduce((s, r) => s + (Number(r.transfer) || 0), 0));
            $('todayTotalStat').textContent = money(rows.reduce((s, r) => s + r.amount, 0));
            const month = todayKey().slice(0, 7), balances = monthBalances(month, todayKey());
            $('homeCashBalance').textContent = money(balances.cash);
            $('homeTransferBalance').textContent = money(balances.bank);
            $('homeTotalBalance').textContent = money(balances.total);
        }
        function updateIncomePreview() { $('incomePreview').textContent = money(safeNum($('cashInput')) + safeNum($('transferInput'))) }
        function isToday(date) { return date === todayKey() }
        function resetIncomeForm() { editingIncomeId = null; $('incomeForm').reset(); $('incomeDate').value = todayKey(); $('incomeFormTitle').textContent = 'Add income transaction'; $('saveIncomeBtn').textContent = 'Save income'; $('cancelIncomeEditBtn').classList.add('hidden'); $('incomeDate').disabled = false; updateIncomePreview() }
        function resetExpenseForm() { editingExpenseId = null; $('expenseForm').reset(); $('expenseDate').value = todayKey(); $('expenseSource').value = 'cash'; $('expenseSource').required = true; $('expenseFormTitle').textContent = 'Record money removed'; $('saveExpenseBtn').textContent = 'Save money removed'; $('cancelExpenseEditBtn').classList.add('hidden'); $('expenseDate').disabled = false; const legacyOption = $('expenseSource').querySelector('option[value="unassigned"]'); if (legacyOption) legacyOption.remove() }
        function collectionRef(name) { return collection(db, 'users', currentUser.uid, name) }
        async function loadRecords() { setStatus('Loading your cloud records…'); try { const [txSnap, exSnap, daysSnap, transferSnap] = await Promise.all([getDocs(collectionRef('transactions')), getDocs(collectionRef('expenses')), getDocs(collectionRef('days')), getDocs(collectionRef('internalTransfers'))]); incomes = txSnap.docs.map(d => ({ id: d.id, ...d.data() })); expenses = exSnap.docs.map(d => ({ id: d.id, ...d.data() })); legacyDays = daysSnap.docs.map(d => ({ id: d.id, ...d.data(), legacy: true })); internalTransfers = transferSnap.docs.map(d => ({ id: d.id, ...d.data() })); updateToday(); renderRecords(); setStatus('Your records are synced with Firebase.', 'good') } catch (e) { console.error(e); setStatus('Could not load records. Check Firestore security rules. Details: ' + e.message, 'error') } }
        function addAction(actions, label, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', fn); actions.appendChild(b) }
        function renderRecords() {
            const body = $('recordsBody'); body.replaceChildren(); const month = $('historyMonth').value; const rows = [...allIncomeRows().map(r => ({ ...r, recordType: 'income' })), ...expenses.map(r => ({ ...r, recordType: 'expense', amount: Number(r.amount) || 0 })), ...internalTransfers.map(r => ({ ...r, recordType: 'internalTransfer', amount: Number(r.amount) || 0 }))].filter(r => !month || r.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')); $('emptyRecords').classList.toggle('hidden', rows.length > 0); $('recordsBody').closest('table').classList.toggle('hidden', rows.length === 0); $('recordCount').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
            for (const r of rows) { const tr = document.createElement('tr'); const expenseType = r.recordType === 'expense' ? (r.source === 'cash' ? 'Money removed (Cash)' : r.source === 'transfer' ? 'Money removed (Bank)' : 'Money removed (older entry; source unknown)') : r.recordType === 'internalTransfer' ? (r.direction === 'cashToBank' ? 'Internal transfer (Cash → Bank)' : 'Internal transfer (Bank → Cash)') : 'Income'; const values = [r.date, r.recordType === 'income' ? 'Income' : expenseType, r.recordType === 'income' ? money(r.cash) : r.recordType === 'internalTransfer' && r.direction === 'bankToCash' ? money(r.amount) : '—', r.recordType === 'income' ? money(r.transfer) : r.recordType === 'internalTransfer' && r.direction === 'cashToBank' ? money(r.amount) : '—', money(r.amount), r.note || '']; for (const v of values) { const td = document.createElement('td'); td.textContent = v; if (typeof v === 'string' && v.startsWith('₦')) td.className = 'amount'; tr.appendChild(td) } const td = document.createElement('td'), actions = document.createElement('div'); actions.className = 'actions'; if (isToday(r.date)) { if (r.recordType === 'income' && r.kind === 'legacy') { addAction(actions, 'Edit', 'secondary', () => editLegacy(r)); addAction(actions, 'Delete', 'danger', () => deleteLegacy(r)) } else if (r.recordType === 'income') { addAction(actions, 'Edit', 'secondary', () => editIncome(r)); addAction(actions, 'Delete', 'danger', () => deleteIncome(r)) } else if (r.recordType === 'expense') { addAction(actions, 'Edit', 'secondary', () => editExpense(r)); addAction(actions, 'Delete', 'danger', () => deleteExpense(r)) } else { addAction(actions, 'Delete', 'danger', () => deleteInternalTransfer(r)) } } else { const locked = document.createElement('span'); locked.className = 'pill'; locked.textContent = 'Locked'; actions.appendChild(locked) } td.appendChild(actions); tr.appendChild(td); body.appendChild(tr) }
            updateToday()
        }
        function editIncome(r) { if (!isToday(r.date)) return alert('Only today’s entries can be edited.'); editingIncomeId = r.id; $('incomeDate').value = r.date; $('incomeDate').disabled = true; $('cashInput').value = r.cash; $('transferInput').value = r.transfer; $('incomeNote').value = r.note || ''; $('incomeFormTitle').textContent = 'Edit today’s income'; $('saveIncomeBtn').textContent = 'Update income'; $('cancelIncomeEditBtn').classList.remove('hidden'); updateIncomePreview(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        function editLegacy(r) { if (!isToday(r.date)) return alert('Previous-day records are locked.'); editingIncomeId = 'legacy:' + r.date; $('incomeDate').value = r.date; $('incomeDate').disabled = true; $('cashInput').value = r.cash; $('transferInput').value = r.transfer; $('incomeNote').value = r.note || ''; $('incomeFormTitle').textContent = 'Edit today’s original daily record'; $('saveIncomeBtn').textContent = 'Update record'; $('cancelIncomeEditBtn').classList.remove('hidden'); updateIncomePreview(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        function editExpense(r) { if (!isToday(r.date)) return alert('Only today’s entries can be edited.'); editingExpenseId = r.id; $('expenseDate').value = r.date; $('expenseDate').disabled = true; $('expenseAmount').value = r.amount; $('expenseNote').value = r.note || ''; const existingUnknown = !['cash', 'transfer'].includes(r.source); let unknownOption = $('expenseSource').querySelector('option[value="unassigned"]'); if (existingUnknown && !unknownOption) { unknownOption = document.createElement('option'); unknownOption.value = 'unassigned'; unknownOption.textContent = 'Unknown (older entry)'; $('expenseSource').appendChild(unknownOption) } $('expenseSource').value = existingUnknown ? 'unassigned' : r.source; $('expenseSource').required = !existingUnknown; $('expenseFormTitle').textContent = 'Edit today’s money removed'; $('saveExpenseBtn').textContent = 'Update removal'; $('cancelExpenseEditBtn').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        async function deleteIncome(r) { if (!isToday(r.date)) return alert('Previous-day records are locked.'); if (!confirm('Delete this income entry?')) return; try { await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', r.id)); incomes = incomes.filter(x => x.id !== r.id); renderRecords(); setStatus('Income entry deleted.', 'good') } catch (e) { setStatus('Delete failed: ' + e.message, 'error') } }
        async function deleteLegacy(r) { if (!isToday(r.date)) return alert('Previous-day records are locked.'); if (!confirm('Delete today’s original daily record?')) return; try { await deleteDoc(doc(db, 'users', currentUser.uid, 'days', r.date)); legacyDays = legacyDays.filter(x => x.date !== r.date); renderRecords(); setStatus('Today’s original record deleted.', 'good') } catch (e) { setStatus('Delete failed: ' + e.message, 'error') } }
        async function deleteExpense(r) { if (!isToday(r.date)) return alert('Previous-day records are locked.'); if (!confirm('Delete this money-removal entry?')) return; try { await deleteDoc(doc(db, 'users', currentUser.uid, 'expenses', r.id)); expenses = expenses.filter(x => x.id !== r.id); renderRecords(); setStatus('Money-removal entry deleted.', 'good') } catch (e) { setStatus('Delete failed: ' + e.message, 'error') } }
        function randomId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}` }
        $('signInBtn').addEventListener('click', async () => { $('signInBtn').disabled = true; try { await signInWithPopup(auth, provider) } catch (e) { console.error(e); if (e.code === 'auth/popup-blocked') { try { await signInWithRedirect(auth, provider); return } catch (er) { e = er } } toast(friendlyError(e),'error'); } finally { $('signInBtn').disabled = false } });
        $('signOutBtn').addEventListener('click', () => signOut(auth));
        $('cashInput').addEventListener('input', updateIncomePreview); $('transferInput').addEventListener('input', updateIncomePreview); $('cancelIncomeEditBtn').addEventListener('click', resetIncomeForm); $('cancelExpenseEditBtn').addEventListener('click', resetExpenseForm);
        $('incomeForm').addEventListener('submit', async ev => { ev.preventDefault(); if (!currentUser) return; const date = $('incomeDate').value; if (date !== todayKey()) { setStatus('You can only add income for today. Previous days are locked.', 'error'); return } const cash = safeNum($('cashInput')), transfer = safeNum($('transferInput')), note = $('incomeNote').value.trim(); if (cash + transfer <= 0) { setStatus('Enter an amount greater than zero.', 'error'); return } const btn = $('saveIncomeBtn'); btn.disabled = true; setStatus('Saving income to the cloud…'); try { const data = { date, cash, transfer, note, updatedAt: new Date().toISOString() }; if (editingIncomeId?.startsWith('legacy:')) { const oldDate = editingIncomeId.slice(7); await setDoc(doc(db, 'users', currentUser.uid, 'days', oldDate), { date: oldDate, cash, transfer, note, updatedAt: new Date().toISOString() }); legacyDays = legacyDays.map(r => r.date === oldDate ? { ...r, ...data, id: oldDate } : r) } else { const id = editingIncomeId || randomId(); data.createdAt = editingIncomeId ? (incomes.find(r => r.id === editingIncomeId)?.createdAt || new Date().toISOString()) : new Date().toISOString(); await setDoc(doc(db, 'users', currentUser.uid, 'transactions', id), data); if (editingIncomeId) incomes = incomes.map(r => r.id === id ? { id, ...data } : r); else incomes.push({ id, ...data }) } resetIncomeForm(); renderRecords(); setStatus('Income saved.', 'good') } catch (e) { console.error(e); setStatus('Income save failed: ' + e.message, 'error') } finally { btn.disabled = false } });
        function sourceBalanceForMonth(source, month, throughDate) {
            const income = allIncomeRows().filter(r => r.date.startsWith(month) && r.date <= throughDate)
                .reduce((sum, r) => sum + (Number(r[source]) || 0), 0);
            const removed = expenses.filter(r => r.date.startsWith(month) && r.date <= throughDate && r.source === source)
                .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const movedOut = internalTransfers.filter(r => r.date.startsWith(month) && r.date <= throughDate && ((source === 'cash' && r.direction === 'cashToBank') || (source === 'transfer' && r.direction === 'bankToCash')))
                .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const movedIn = internalTransfers.filter(r => r.date.startsWith(month) && r.date <= throughDate && ((source === 'cash' && r.direction === 'bankToCash') || (source === 'transfer' && r.direction === 'cashToBank')))
                .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            return income - removed - movedOut + movedIn;
        }
        $('expenseForm').addEventListener('submit', async ev => {
            ev.preventDefault();
            if (!currentUser) return;
            const date = $('expenseDate').value, amount = safeNum($('expenseAmount')),
                note = $('expenseNote').value.trim(), source = $('expenseSource').value;
            if (date !== todayKey()) { setStatus('You can only add money removed for today. Previous days are locked.', 'error'); return }
            if (amount <= 0) { setStatus('Enter an amount greater than zero.', 'error'); return }
            if (!['cash', 'transfer'].includes(source) && !(editingExpenseId && expenses.find(r => r.id === editingExpenseId && !['cash', 'transfer'].includes(r.source)))) {
                setStatus('Choose whether the money was removed from cash or transfer.', 'error'); return;
            }
            const old = expenses.find(r => r.id === editingExpenseId);
            const month = date.slice(0, 7);
            let available = null;
            if (source === 'cash' || source === 'transfer') {
                available = sourceBalanceForMonth(source, month, date);
                if (editingExpenseId && old && old.source === source) available += Number(old.amount) || 0;
                if (amount > available) {
                    const shortfall = amount - available;
                    const sourceName = source === 'cash' ? 'cash' : 'transfer';
                    const warning = `Your recorded ${sourceName} balance for ${month} is ${money(available)}. You are trying to remove ${money(amount)}, which is ${money(shortfall)} more than the recorded balance.

If you continue, the calculated ${sourceName} balance will become ${money(available - amount)}.

Older money-removal entries without a source are not included in this source balance. Continue anyway?`;
                    if (!confirm(warning)) return;
                }
            }
            const btn = $('saveExpenseBtn'); btn.disabled = true; setStatus('Saving money removed…');
            try {
                const id = editingExpenseId || randomId();
                const data = { date, amount, source, note, updatedAt: new Date().toISOString(), createdAt: old?.createdAt || new Date().toISOString() };
                if (source === 'unassigned') delete data.source;
                await setDoc(doc(db, 'users', currentUser.uid, 'expenses', id), data);
                if (editingExpenseId) expenses = expenses.map(r => r.id === id ? { id, ...data } : r);
                else expenses.push({ id, ...data });
                resetExpenseForm(); renderRecords(); setStatus('Money removed saved.', 'good');
            } catch (e) { console.error(e); setStatus('Save failed: ' + e.message, 'error') }
            finally { btn.disabled = false }
        });
        $('transferDate').value = todayKey();
        $('transferForm').addEventListener('submit', async ev => {
            ev.preventDefault();
            if (!currentUser) return;
            const date = $('transferDate').value, amount = safeNum($('internalTransferAmount')),
                direction = $('transferDirection').value, note = $('internalTransferNote').value.trim();
            if (date !== todayKey()) { setStatus('You can only add transfers for today. Previous days are locked.', 'error'); return; }
            if (amount <= 0) { setStatus('Enter an amount greater than zero.', 'error'); return; }
            const source = direction === 'cashToBank' ? 'cash' : 'transfer';
            const available = sourceBalanceForMonth(source, date.slice(0, 7), date);
            if (amount > available && !confirm(`Your recorded ${source === 'cash' ? 'cash' : 'bank'} balance is ${money(available)}. This transfer is ${money(amount)}. Continue anyway?`)) return;
            const btn = $('saveInternalTransferBtn'); btn.disabled = true; setStatus('Saving internal transfer…');
            try {
                const id = randomId(), data = { date, amount, direction, note, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                await setDoc(doc(db, 'users', currentUser.uid, 'internalTransfers', id), data);
                internalTransfers.push({ id, ...data }); $('transferForm').reset(); $('transferDate').value = todayKey(); $('transferDirection').value = 'cashToBank';
                renderRecords(); setStatus('Transfer completed successfully.', 'good');
            } catch (e) { console.error(e); setStatus('Transfer save failed: ' + e.message, 'error'); }
            finally { btn.disabled = false; }
        });
        async function deleteInternalTransfer(r) {
            if (!isToday(r.date)) return alert('Previous-day transfers are locked.');
            if (!confirm('Delete this internal transfer?')) return;
            try { await deleteDoc(doc(db, 'users', currentUser.uid, 'internalTransfers', r.id)); internalTransfers = internalTransfers.filter(x => x.id !== r.id); renderRecords(); setStatus('Internal transfer deleted.', 'good'); }
            catch (e) { setStatus('Delete failed: ' + e.message, 'error'); }
        }
        $('calculateMonthBtn').addEventListener('click', () => {
            const month = $('monthInput').value;
            if (!month) { $('monthStatus').textContent = 'Choose a month first.'; return }
            const today = todayKey(), [year, monthNumber] = month.split('-').map(Number),
                lastDay = new Date(year, monthNumber, 0).getDate(), monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`,
                end = month === today.slice(0, 7) ? today : monthEnd;
            const rows = allIncomeRows().filter(r => r.date.startsWith(month) && r.date <= end);
            const cash = rows.reduce((sum, r) => sum + (Number(r.cash) || 0), 0);
            const transfer = rows.reduce((sum, r) => sum + (Number(r.transfer) || 0), 0);
            const inc = cash + transfer;
            const monthExpenses = expenses.filter(r => r.date.startsWith(month) && r.date <= end);
            const cashRemoved = monthExpenses.filter(r => r.source === 'cash').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const transferRemoved = monthExpenses.filter(r => r.source === 'transfer').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const unassignedRemoved = monthExpenses.filter(r => !['cash', 'transfer'].includes(r.source)).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const rem = cashRemoved + transferRemoved + unassignedRemoved;
            const monthTransfers = internalTransfers.filter(r => r.date.startsWith(month) && r.date <= end);
            const cashToBank = monthTransfers.filter(r => r.direction === 'cashToBank').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const bankToCash = monthTransfers.filter(r => r.direction === 'bankToCash').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
            const cashRemaining = cash - cashRemoved - cashToBank + bankToCash, transferRemaining = transfer - transferRemoved + cashToBank - bankToCash, net = inc - rem;
            $('monthCashStat').textContent = money(cash);
            $('monthTransferStat').textContent = money(transfer);
            $('monthIncomeStat').textContent = money(inc);
            $('monthCashRemovedStat').textContent = money(cashRemoved);
            $('monthTransferRemovedStat').textContent = money(transferRemoved);
            $('monthUnassignedRemovedStat').textContent = money(unassignedRemoved);
            $('monthRemovedStat').textContent = money(rem);
            $('monthCashRemainingStat').textContent = money(cashRemaining);
            $('monthTransferRemainingStat').textContent = money(transferRemaining);
            $('monthNetStat').textContent = money(net);
            $('monthCashRemainingStat').className = 'value ' + (cashRemaining < 0 ? 'negative' : 'positive');
            $('monthTransferRemainingStat').className = 'value ' + (transferRemaining < 0 ? 'negative' : 'positive');
            $('monthNetStat').className = 'value ' + (net < 0 ? 'negative' : 'positive');
            $('monthStatus').textContent = `Calculated ${month}-01 through ${end}. Cash and transfer balances are calculated separately. Total remaining = total income − all money removed. Internal transfers adjust cash and bank balances but are excluded from income and money removed. Older removals without a source are included in total removed only.`;
            monthlyCalculated = true;
        });
        $('historyMonth').addEventListener('change', renderRecords); $('clearHistoryFilter').addEventListener('click', () => { $('historyMonth').value = ''; renderRecords() });
        function refreshDateInputs() { $('incomeDate').value = todayKey(); $('expenseDate').value = todayKey(); $('transferDate').value = todayKey(); if (!editingIncomeId) $('incomeDate').disabled = false; if (!editingExpenseId) $('expenseDate').disabled = false }
        setInterval(() => { if (!editingIncomeId && !editingExpenseId) { refreshDateInputs() } }, 30000);
        refreshDateInputs(); $('expenseSource').value = 'cash'; $('monthInput').value = todayKey().slice(0, 7); updateIncomePreview();
        getRedirectResult(auth).catch(e => { console.error(e); toast(friendlyError(e),'error'); });
        onAuthStateChanged(auth, async user => { currentUser = user; if (user && isEmailPasswordUser(user) && !user.emailVerified) { showVerification(user); refreshPasswordLinkUI(user); hideSplash(); return; } if (user) { $('verifyCard').classList.add('hidden'); showLoggedIn(user); refreshPasswordLinkUI(user); await loadRecords() } else { $('verifyCard').classList.add('hidden'); showLoggedOut(); refreshPasswordLinkUI(null); setLoginStatus('') } hideSplash(); });
