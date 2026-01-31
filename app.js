// --- VARIABLES & CONFIG ---
let clients = [];
let loans = [];
let expenses = [];

const PENALTY_FEE = 300;
const MAX_LOAN_CAP = 100000;
const BASE_LIMIT = 20000;

const formatNaira = (amt) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amt);

// --- FIREBASE CONNECTION ---
document.addEventListener('firebase-ready', () => {
    const statusBadge = document.getElementById('connectionStatus');
    
    const dbRef = window.dbRef(window.db, '/');
    window.dbOnValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            clients = data.clients || [];
            loans = data.loans || [];
            expenses = data.expenses || [];
        } else {
            // Empty DB
            clients = []; loans = []; expenses = [];
        }

        // Update UI
        statusBadge.className = 'badge bg-success';
        statusBadge.innerText = 'Online';
        renderAll();
    }, (error) => {
        statusBadge.className = 'badge bg-danger';
        statusBadge.innerText = 'Error';
        console.error("Firebase Error:", error);
        alert("Database Permission Denied. Did you fix the Rules in Console?");
    });
});

function saveToCloud() {
    document.getElementById('connectionStatus').innerText = 'Saving...';
    window.dbSet(window.dbRef(window.db, '/'), {
        clients: clients,
        loans: loans,
        expenses: expenses,
        lastUpdated: new Date().toISOString()
    }).then(() => {
        document.getElementById('connectionStatus').innerText = 'Online';
    });
}

function renderAll() {
    renderClients();
    renderLoans();
    renderExpenses();
    updateDashboard();
}

// --- CLIENTS ---
document.getElementById('clientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    clients.push({
        id: Date.now(),
        name: document.getElementById('clientName').value,
        phone: document.getElementById('clientPhone').value,
        address: document.getElementById('clientAddress').value,
        isBlacklisted: false
    });
    saveToCloud();
    e.target.reset(); bootstrap.Modal.getInstance(document.getElementById('addClientModal')).hide();
});

function toggleBlacklist(id) {
    const c = clients.find(x => x.id == id);
    c.isBlacklisted = !c.isBlacklisted;
    saveToCloud();
}

// --- SMART LOAN LOGIC ---
function calculateClientLimit() {
    const clientId = document.getElementById('loanClientSelect').value;
    const client = clients.find(c => c.id == clientId);
    if(!client) return 0;

    if (client.isBlacklisted) {
        setLimitUI(0, "Blacklisted", "bg-danger");
        return 0;
    }

    let limit = BASE_LIMIT; 
    let msg = "Starter";
    let bg = "bg-secondary";

    // Check history
    const pastLoans = loans.filter(l => l.clientId == clientId && l.status === 'Paid');
    let badLoans = 0;
    
    // Check for penalties in history
    pastLoans.forEach(l => {
        // If loan had penalty (assuming we tracked it, for MVP we check simple balance logic or just count paid count)
        // For simple MVP logic: Just count paid loans increases limit
    });

    // Add 20k per paid loan
    if(pastLoans.length > 0) {
        limit += (pastLoans.length * 20000);
        msg = `Level ${pastLoans.length}`;
        bg = "bg-success";
    }

    if (limit > MAX_LOAN_CAP) { limit = MAX_LOAN_CAP; msg = "MAX VIP"; }
    
    setLimitUI(limit, msg, bg);
    return limit;
}

function setLimitUI(limit, msg, bg) {
    document.getElementById('calculatedLimit').value = limit;
    document.getElementById('dynamicLimitDisplay').innerText = formatNaira(limit);
    const badge = document.getElementById('limitMessage');
    badge.className = `badge ${bg}`;
    badge.innerText = msg;
}

// Open Modal Logic
window.openNewLoanModal = function(topUpId = null) {
    document.getElementById('loanForm').reset();
    const select = document.getElementById('loanClientSelect');
    select.innerHTML = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
    document.getElementById('isTopUp').value = 'false';
    document.getElementById('topUpAlert').classList.add('d-none');
    document.getElementById('oldLoanId').value = '';
    select.disabled = false;

    if(topUpId) {
        const l = loans.find(x => x.id == topUpId);
        document.getElementById('isTopUp').value = 'true';
        document.getElementById('topUpAlert').classList.remove('d-none');
        document.getElementById('topUpOldBalance').innerText = formatNaira(l.balance);
        document.getElementById('oldLoanId').value = topUpId;
        select.value = l.clientId;
        select.disabled = true;
    }

    calculateClientLimit();
    updatePreview(); // Clear preview
    new bootstrap.Modal(document.getElementById('newLoanModal')).show();
};

function updatePreview() {
    const amt = parseFloat(document.getElementById('loanAmount').value) || 0;
    const term = parseFloat(document.getElementById('loanTerm').value) || 0;
    const rate = document.getElementById('loanRate').value;
    const freq = document.getElementById('loanFreq').value;
    const date = document.getElementById('loanDate').value;
    const limit = parseFloat(document.getElementById('calculatedLimit').value);
    const isTopUp = document.getElementById('isTopUp').value === 'true';
    const oldId = document.getElementById('oldLoanId').value;

    let exposure = amt;
    if(isTopUp) {
        const l = loans.find(x => x.id == oldId);
        if(l) exposure += l.balance;
    }

    let isValid = true;
    
    // Check Limit
    if(exposure > limit) {
        document.getElementById('amountFeedback').classList.remove('d-none');
        isValid = false;
    } else {
        document.getElementById('amountFeedback').classList.add('d-none');
    }

    // Check Tenure (Max 6 months)
    let maxT = freq === 'Monthly' ? 6 : 26;
    if(term > maxT) {
        document.getElementById('termFeedback').innerText = `Max ${maxT} ${freq === 'Monthly' ? 'Months' : 'Weeks'}`;
        document.getElementById('termFeedback').classList.remove('d-none');
        isValid = false;
    } else {
        document.getElementById('termFeedback').classList.add('d-none');
    }

    document.getElementById('btnIssueLoan').disabled = !isValid;

    if(amt && term && date && isValid) {
        const { total, schedule } = calculateSchedule(amt, rate, term, freq, date);
        document.getElementById('previewTotal').innerText = formatNaira(total);
        document.getElementById('previewBody').innerHTML = schedule.map((s,i) => `<tr><td>${i+1}. ${s.date}</td><td>${formatNaira(s.amount)}</td></tr>`).join('');
    } else {
        document.getElementById('previewBody').innerHTML = '';
        document.getElementById('previewTotal').innerText = '₦0.00';
    }
}

function calculateSchedule(amt, rate, term, freq, start) {
    const p = parseFloat(amt);
    const total = p + (p * (rate/100));
    const inst = total / parseInt(term);
    let s = [];
    let d = new Date(start);
    for(let i=0; i<term; i++) {
        if(freq==='Daily') d.setDate(d.getDate()+1);
        else if(freq==='Weekly') d.setDate(d.getDate()+7);
        else d.setMonth(d.getMonth()+1);
        s.push({ date: d.toISOString().split('T')[0], amount: inst, paid: false });
    }
    return { total, schedule: s };
}

document.getElementById('loanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const isTopUp = document.getElementById('isTopUp').value === 'true';
    const oldId = document.getElementById('oldLoanId').value;
    const amt = parseFloat(document.getElementById('loanAmount').value);
    const rate = document.getElementById('loanRate').value;
    const term = document.getElementById('loanTerm').value;
    const freq = document.getElementById('loanFreq').value;
    const date = document.getElementById('loanDate').value;
    const clientId = document.getElementById('loanClientSelect').value;

    let p = amt;
    if(isTopUp) {
        const l = loans.find(x => x.id == oldId);
        p += l.balance;
        l.balance = 0; l.status = 'Restructured';
    }

    const { total, schedule } = calculateSchedule(p, rate, term, freq, date);
    loans.push({
        id: Date.now(), clientId, principal: p, totalRepayable: total, balance: total, schedule, status: 'Active', frequency: freq, term
    });

    saveToCloud();
    bootstrap.Modal.getInstance(document.getElementById('newLoanModal')).hide();
});

// --- PAYMENTS ---
window.openPay = function(id) {
    const l = loans.find(x => x.id == id);
    document.getElementById('payLoanId').value = id;
    document.getElementById('payBalance').innerText = formatNaira(l.balance);
    new bootstrap.Modal(document.getElementById('repaymentModal')).show();
};

window.processRepayment = function() {
    const id = document.getElementById('payLoanId').value;
    const amt = parseFloat(document.getElementById('payAmount').value);
    const l = loans.find(x => x.id == id);
    
    if(amt > 0) {
        l.balance -= amt;
        if(l.balance <= 0) { l.balance = 0; l.status = 'Paid'; }
        
        // Auto mark schedule
        let paid = l.totalRepayable - l.balance;
        let r = 0;
        l.schedule.forEach(s => { r+=s.amount; if(r <= paid+100) s.paid = true; });
        
        saveToCloud();
        bootstrap.Modal.getInstance(document.getElementById('repaymentModal')).hide();
    }
};

// --- EXPENSES ---
document.getElementById('expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    expenses.push({
        id: Date.now(),
        date: document.getElementById('expDate').value,
        cat: document.getElementById('expCat').value,
        amount: parseFloat(document.getElementById('expAmount').value),
        note: document.getElementById('expNote').value
    });
    saveToCloud();
    bootstrap.Modal.getInstance(document.getElementById('expenseModal')).hide();
});

// --- RENDERERS ---
function renderClients() {
    document.getElementById('clientTableBody').innerHTML = clients.map(c => `
        <tr><td>${c.name}</td><td>${c.phone}</td>
        <td>${c.isBlacklisted ? '<span class="badge bg-danger">Blacklist</span>' : '<span class="badge bg-success">Active</span>'}</td>
        <td><button class="btn btn-sm btn-outline-dark" onclick="toggleBlacklist(${c.id})">Toggle</button></td></tr>
    `).join('');
}

function renderLoans() {
    document.getElementById('loanTableBody').innerHTML = loans.map(l => {
        const c = clients.find(x => x.id == l.clientId) || {name:'Unknown'};
        const st = l.status === 'Paid' ? 'bg-success' : (l.status==='Restructured'?'bg-secondary':'bg-primary');
        return `<tr>
            <td>${c.name}<br><small>${l.frequency}</small></td>
            <td><small>${l.term} Inst.</small></td>
            <td>${formatNaira(l.totalRepayable)}</td>
            <td class="text-danger fw-bold">${formatNaira(l.balance)}</td>
            <td><span class="badge ${st}">${l.status}</span></td>
            <td>${l.balance>0 ? `<div class="btn-group"><button class="btn btn-sm btn-success" onclick="openPay(${l.id})">Pay</button><button class="btn btn-sm btn-warning" onclick="openNewLoanModal(${l.id})">♻</button></div>` : '-'}</td>
        </tr>`;
    }).join('');
}

function renderExpenses() {
    document.getElementById('expenseTableBody').innerHTML = expenses.map(e => `
        <tr><td>${e.date}</td><td>${e.cat}<br><small>${e.note}</small></td><td>${formatNaira(e.amount)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteExp(${e.id})">x</button></td></tr>
    `).join('');
}
window.deleteExp = function(id) { expenses = expenses.filter(e => e.id !== id); saveToCloud(); };

function updateDashboard() {
    const out = loans.filter(l => l.balance > 0).reduce((s,l) => s+l.balance, 0);
    const exp = expenses.reduce((s,e) => s+e.amount, 0);
    const gross = loans.reduce((s,l) => s + (l.totalRepayable - l.principal), 0);
    
    document.getElementById('dashOutstanding').innerText = formatNaira(out);
    document.getElementById('dashExpenses').innerText = formatNaira(exp);
    document.getElementById('dashNetProfit').innerText = formatNaira(gross - exp);
    
    // PAR > 30 Days
    const today = new Date();
    let par = 0;
    loans.forEach(l => {
        if(l.balance>0) {
            const overdue = l.schedule.find(s => !s.paid && (today - new Date(s.date))/(1000*3600*24) > 30);
            if(overdue) par += l.balance;
        }
    });
    document.getElementById('dashPAR').innerText = formatNaira(par);
}

// Utils
window.runCalc = function() {
    const p = parseFloat(document.getElementById('calcP').value);
    const t = parseFloat(document.getElementById('calcT').value);
    if(p&&t) {
        document.getElementById('resProfit').innerText = formatNaira(t-p);
        document.getElementById('resRate').innerText = (((t-p)/p)*100).toFixed(1)+'%';
        document.getElementById('calcRes').classList.remove('d-none');
    }
};

// Set defaults
document.getElementById('loanDate').value = new Date().toISOString().split('T')[0];
document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
