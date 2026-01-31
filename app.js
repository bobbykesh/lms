// --- DATABASE INITIALIZATION ---
// We try to get data from LocalStorage first. If not found, use empty arrays.
let clients = JSON.parse(localStorage.getItem('lm_clients')) || [];
let loans = JSON.parse(localStorage.getItem('lm_loans')) || [];

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    renderClients();
    renderLoans();
    updateDashboard();
    
    // Set default date picker to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('loanDate').value = today;
});

// --- 1. CLIENT MANAGEMENT ---

// Add Client
document.getElementById('clientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const newClient = {
        id: Date.now(), // Unique ID based on timestamp
        name: document.getElementById('clientName').value,
        phone: document.getElementById('clientPhone').value,
        address: document.getElementById('clientAddress').value
    };
    
    clients.push(newClient);
    saveToLocalStorage(); // Auto-save
    renderClients();
    updateDashboard();
    
    e.target.reset();
    bootstrap.Modal.getInstance(document.getElementById('addClientModal')).hide();
});

// Render Client Table
function renderClients() {
    const tbody = document.getElementById('clientTableBody');
    if(clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No clients yet. Add one!</td></tr>';
        return;
    }

    tbody.innerHTML = clients.map(c => `
        <tr>
            <td class="text-muted"><small>#${c.id.toString().slice(-4)}</small></td>
            <td class="fw-bold">${c.name}</td>
            <td>${c.phone}</td>
            <td>${c.address}</td>
        </tr>
    `).join('');
}

// --- 2. LOAN ORIGINATION ---

// Populate the Dropdown in New Loan Modal
function loadClientSelect() {
    const select = document.getElementById('loanClientSelect');
    if(clients.length === 0) {
        select.innerHTML = '<option value="">No clients found. Add a client first.</option>';
    } else {
        select.innerHTML = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

// Add Loan
document.getElementById('loanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const amount = parseFloat(document.getElementById('loanAmount').value);
    const rate = parseFloat(document.getElementById('loanRate').value);
    const term = parseInt(document.getElementById('loanTerm').value);
    const clientId = document.getElementById('loanClientSelect').value;
    
    if(!clientId) return alert("Please select a valid client.");

    // Simple Flat Interest Calculation: Principal + (Principal * Rate%)
    const totalInterest = amount * (rate / 100);
    const totalRepayable = amount + totalInterest;
    
    const newLoan = {
        id: Date.now(),
        clientId: clientId,
        amount: amount, // Principal
        totalRepayable: totalRepayable, // Total owed
        balance: totalRepayable, // Outstanding balance (starts as total)
        term: term,
        startDate: document.getElementById('loanDate').value,
        status: 'Active'
    };
    
    loans.push(newLoan);
    saveToLocalStorage(); // Auto-save
    renderLoans();
    updateDashboard();
    
    e.target.reset();
    bootstrap.Modal.getInstance(document.getElementById('newLoanModal')).hide();
});

// Render Loan Table
function renderLoans() {
    const tbody = document.getElementById('loanTableBody');
    if(loans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No active loans.</td></tr>';
        return;
    }

    tbody.innerHTML = loans.map(l => {
        const client = clients.find(c => c.id == l.clientId) || {name: 'Unknown Client'};
        
        // Calculate Due Date (Start Date + Term Months)
        const dueDate = new Date(l.startDate);
        dueDate.setMonth(dueDate.getMonth() + l.term);
        
        // Dynamic Badge
        let statusBadge = l.balance <= 0 
            ? '<span class="badge bg-success">Paid</span>' 
            : '<span class="badge bg-primary">Active</span>';
            
        // Pay Button logic
        let actionBtn = l.balance > 0 
            ? `<button class="btn btn-sm btn-outline-success fw-bold" onclick="openRepayment(${l.id})">Pay</button>` 
            : `<span class="text-muted small">Completed</span>`;

        return `
        <tr>
            <td>
                <div class="fw-bold">${client.name}</div>
                <small class="text-muted">Loan #${l.id.toString().slice(-4)}</small>
            </td>
            <td>$${l.totalRepayable.toFixed(2)}</td>
            <td class="fw-bold text-danger">$${l.balance.toFixed(2)}</td>
            <td>${dueDate.toLocaleDateString()}</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        </tr>
    `}).join('');
}

// --- 3. REPAYMENT LOGIC ---

function openRepayment(loanId) {
    const loan = loans.find(l => l.id == loanId);
    if(!loan) return;

    document.getElementById('payLoanId').value = loanId;
    document.getElementById('payCurrentBalance').innerText = `$${loan.balance.toFixed(2)}`;
    document.getElementById('payAmount').value = ''; 
    
    new bootstrap.Modal(document.getElementById('repaymentModal')).show();
}

function processRepayment() {
    const loanId = document.getElementById('payLoanId').value;
    const amount = parseFloat(document.getElementById('payAmount').value);
    
    if(!amount || amount <= 0) return alert("Please enter a valid amount.");

    const loan = loans.find(l => l.id == loanId);
    
    // Deduct amount
    loan.balance -= amount;
    
    // Handle overpayment or completion
    if(loan.balance <= 0.01) {
        loan.balance = 0;
        loan.status = 'Paid';
    }

    saveToLocalStorage(); // Auto-save
    renderLoans();
    updateDashboard();
    
    bootstrap.Modal.getInstance(document.getElementById('repaymentModal')).hide();
}

// --- 4. DASHBOARD & UTILS ---

function updateDashboard() {
    const totalLent = loans.reduce((sum, l) => sum + l.amount, 0);
    const totalOutstanding = loans.reduce((sum, l) => sum + l.balance, 0);
    
    document.getElementById('totalLent').innerText = `$${totalLent.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('totalOutstanding').innerText = `$${totalOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('totalClients').innerText = clients.length;
}

function saveToLocalStorage() {
    localStorage.setItem('lm_clients', JSON.stringify(clients));
    localStorage.setItem('lm_loans', JSON.stringify(loans));
}

function clearData() {
    if(confirm("⚠ ARE YOU SURE?\n\nThis will wipe all data from this browser.\nMake sure you have a Backup File saved first!")) {
        localStorage.clear();
        location.reload();
    }
}

// --- 5. BACKUP & RESTORE (TXT FILE SYSTEM) ---

// DOWNLOAD: Saves the current database as a .txt file
function downloadData() {
    const data = {
        timestamp: new Date().toISOString(),
        clients: clients,
        loans: loans
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    
    const fileName = `loan_backup_${new Date().toISOString().slice(0,10)}.txt`;
    
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// UPLOAD: Reads the .txt file and restores data
function loadFromFile(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            
            // Validation check to ensure it's our file format
            if(data.clients && data.loans) {
                if(confirm(`Found backup from ${data.timestamp || 'unknown date'}.\n\nOverwrite current data?`)) {
                    clients = data.clients;
                    loans = data.loans;
                    
                    saveToLocalStorage();
                    location.reload();
                }
            } else {
                alert("Error: This file does not look like a valid backup.");
            }
        } catch(e) {
            console.error(e);
            alert("Error reading file. Please try again.");
        }
    };
    
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    inputElement.value = '';
}
