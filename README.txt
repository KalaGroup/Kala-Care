Frontend:

cd client
npm install
npm run dev / npm run build


Backend: 

cd server
Remove-Item -Path "venv" -Recurse -Force -ErrorAction SilentlyContinue
python -m venv venv
.\venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install fastapi uvicorn sqlalchemy pyodbc python-dotenv pandas openpyxl
uvicorn app.main:app --host 127.0.0.1 --port 5004



Backend exe: 

cd server
.\venv\Scripts\pyinstaller.exe --onefile --name backend --add-data "app;app" --add-data ".env;." --collect-all fastapi --collect-all uvicorn --collect-all sqlalchemy --collect-all pandas --collect-all openpyxl --collect-all passlib --collect-all bcrypt --collect-all argon2 --collect-all cryptography --collect-all pyodbc --collect-all email app\run.py



CREATE INDEX idx_fu_user_created ON followups(user_id, created_at);
CREATE INDEX idx_fu_campaign_status ON followups(campaign_id, status);
CREATE INDEX idx_fu_customer_instance ON followups(customer_instance_id);
CREATE INDEX idx_fu_status ON followups(status);
CREATE INDEX idx_fu_user_campaign ON followups(user_id, campaign_id);
CREATE INDEX idx_users_branch ON users(branch);






IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_branch_instance')
    CREATE INDEX idx_customers_branch_instance ON customers(branch_id, instance_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_fu_campaign_customer')
    CREATE INDEX idx_fu_campaign_customer ON followups(campaign_id, customer_instance_id);



CREATE INDEX idx_followups_customer_date ON followups(customer_id, followup_date DESC);




IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_asset_detailed_instance')
    CREATE INDEX idx_asset_detailed_instance ON asset_detailed(instance_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_amc_agreements_instance_start')
    CREATE INDEX idx_amc_agreements_instance_start ON amc_agreements(instance_id, agreement_start_date DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_non_followups_customer_date')
    CREATE INDEX idx_non_followups_customer_date ON non_followups(customer_id, followup_date DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_non_followups_status')
    CREATE INDEX idx_non_followups_status ON non_followups(status);



CREATE NONCLUSTERED INDEX idx_customers_customer_name
ON customers (customer_name);