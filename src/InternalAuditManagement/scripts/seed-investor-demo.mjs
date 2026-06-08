import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { createClient } from "@supabase/supabase-js";

const keyVaultNameMap = {
  SUPABASE_URL: "Supabase-Url",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase-ServiceRoleKey"
};

const ids = {
  contract: "ctr-investor-demo",
  site: "site-investor-demo",
  returnedClaim: "11111111-1111-4111-8111-111111111111",
  returnedLine: "11111111-1111-4111-8111-111111111112",
  financeClaim: "22222222-2222-4222-8222-222222222221",
  financeLinePendingBilling: "22222222-2222-4222-8222-222222222222",
  financeLineAlreadyBilled: "22222222-2222-4222-8222-222222222223",
  financeAttachment: "22222222-2222-4222-8222-222222222224",
  billingAlert: "33333333-3333-4333-8333-333333333331",
  fraudFlag: "44444444-4444-4444-8444-444444444441",
  approvalFinance: "55555555-5555-4555-8555-555555555551",
  approvalReturned: "55555555-5555-4555-8555-555555555552"
};

async function main() {
  const db = createClient(await getSecret("SUPABASE_URL"), await getSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  await removeDemoRecords(db);
  await seedReferenceData(db);
  await seedReturnedClaim(db);
  await seedFinanceReleaseReadyClaim(db);
  await seedAuditAndBillingQueues(db);

  console.log("Investor demo seed complete.");
  console.log(`Returned claim: EXP-DEMO-RETURNED (${ids.returnedClaim})`);
  console.log(`Finance release-ready claim: EXP-DEMO-PAY (${ids.financeClaim})`);
  console.log(`Billing alert: ${ids.billingAlert}`);
  console.log(`Audit flag: ${ids.fraudFlag}`);
}

async function getSecret(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;
  if (!keyVaultUrl) {
    throw new Error(`${name} is not configured and AZURE_KEY_VAULT_URL is not set.`);
  }

  const client = new SecretClient(keyVaultUrl, new DefaultAzureCredential());
  const secret = await client.getSecret(keyVaultNameMap[name]);
  if (!secret.value) {
    throw new Error(`${keyVaultNameMap[name]} has no value.`);
  }
  return secret.value;
}

async function removeDemoRecords(db) {
  await must(db.from("billing_alerts").delete().eq("alert_id", ids.billingAlert), "delete demo billing alert");
  await must(db.from("fraud_flags").delete().eq("flag_id", ids.fraudFlag), "delete demo fraud flag");
  await must(db.from("expense_attachments").delete().eq("attachment_id", ids.financeAttachment), "delete demo attachment");
  await must(db.from("approval_steps").delete().in("claim_id", [ids.returnedClaim, ids.financeClaim]), "delete demo approval steps");
  await must(db.from("expense_line_items").delete().in("claim_id", [ids.returnedClaim, ids.financeClaim]), "delete demo line items");
  await must(db.from("expense_claims").delete().in("claim_id", [ids.returnedClaim, ids.financeClaim]), "delete demo claims");
}

async function seedReferenceData(db) {
  await must(
    db.from("employees").upsert([
      {
        employee_id: "emp-claimant-001",
        full_name: "Site Supervisor",
        email: "claimant@example.com",
        role: "Claimant",
        direct_manager_id: "emp-hod-001",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 10000,
        bank_account_holder_name: "Site Supervisor",
        bank_account_number: "501002003780",
        bank_ifsc: "HDFC0001234",
        bank_name: "HDFC Test Bank",
        is_active: true
      },
      {
        employee_id: "emp-cluster-001",
        full_name: "Cluster Head",
        email: "clusterhead@example.com",
        role: "ClusterHead",
        direct_manager_id: "emp-hod-001",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 0,
        is_active: true
      },
      {
        employee_id: "emp-hod-001",
        full_name: "Operations HOD",
        email: "hod@example.com",
        role: "HOD",
        direct_manager_id: "emp-md-001",
        is_hod: true,
        approval_threshold_amount: 5000,
        imprest_advance_limit: 0,
        is_active: true
      },
      {
        employee_id: "emp-md-001",
        full_name: "Managing Director",
        email: "md@example.com",
        role: "MD",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 0,
        is_active: true
      },
      {
        employee_id: "emp-finance-001",
        full_name: "Finance User",
        email: "finance@example.com",
        role: "Finance",
        direct_manager_id: "emp-md-001",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 0,
        is_active: true
      },
      {
        employee_id: "emp-finance-hod-001",
        full_name: "Finance HOD",
        email: "financehod@example.com",
        role: "FinanceHOD",
        direct_manager_id: "emp-md-001",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 0,
        is_active: true
      },
      {
        employee_id: "emp-billing-001",
        full_name: "Billing User",
        email: "billing@example.com",
        role: "BillingTeam",
        direct_manager_id: "emp-finance-001",
        is_hod: false,
        approval_threshold_amount: 0,
        imprest_advance_limit: 0,
        is_active: true
      }
    ], { onConflict: "employee_id" }),
    "upsert demo employees"
  );

  await must(
    db.from("client_contracts").upsert({
      contract_id: ids.contract,
      client_name: "Investor Demo RWA",
      description: "Investor demo facility management contract",
      start_date: "2026-01-01",
      is_active: true
    }, { onConflict: "contract_id" }),
    "upsert demo contract"
  );

  await must(
    db.from("sites").upsert({
      site_id: ids.site,
      site_name: "Investor Demo Tower",
      site_address: "Sector 92, Gurugram",
      service_type: "Both",
      contract_id: ids.contract,
      cluster_head_employee_id: "emp-cluster-001",
      is_active: true
    }, { onConflict: "site_id" }),
    "upsert demo site"
  );
}

async function seedReturnedClaim(db) {
  await must(
    db.from("expense_claims").insert({
      claim_id: ids.returnedClaim,
      ticket_id: "EXP-DEMO-RETURNED",
      submitter_employee_id: "emp-claimant-001",
      claim_kind: "Reimbursement",
      submission_mode: "SingleVoucher",
      claim_period_month: "2026-06-01",
      status: "Rejected",
      total_amount: 1250,
      final_payable_amount: 1250,
      site_id: ids.site,
      rejection_reason: "Please attach the missing receipt and correct the vendor invoice number.",
      created_at: "2026-06-05T09:00:00.000Z",
      updated_at: "2026-06-07T09:00:00.000Z",
      is_deleted: false
    }),
    "insert returned demo claim"
  );

  await must(
    db.from("expense_line_items").insert({
      line_item_id: ids.returnedLine,
      claim_id: ids.returnedClaim,
      expense_head: "Electrical repair",
      description: "Returned demo repair expense",
      amount: 1250,
      transaction_date: "2026-06-05",
      payment_mode: "UPI",
      expense_tag: "AlreadyBilled",
      client_invoice_number: "CLIENT-DEMO-RETURNED-001",
      vendor_name: "Demo Electricals",
        vendor_invoice_number: "VENDOR-DEMO-OLD",
        invoice_validation_status: "Valid",
        finance_review_status: "Rejected",
        finance_review_remarks: "Vendor invoice number does not match the receipt.",
        billing_alert_created: false,
        site_id: ids.site,
        missing_receipt_flag: true,
        sort_order: 0,
      is_deleted: false
    }),
    "insert returned demo line"
  );

  await must(
    db.from("approval_steps").insert({
      step_id: ids.approvalReturned,
      claim_id: ids.returnedClaim,
      step_order: 1,
      required_approver_role: "Finance",
      assigned_approver_id: "emp-finance-001",
      decision: "Rejected",
      decision_at: "2026-06-07T09:00:00.000Z",
      remarks: "Please attach the missing receipt and correct the vendor invoice number."
    }),
    "insert returned demo approval step"
  );
}

async function seedFinanceReleaseReadyClaim(db) {
  await must(
    db.from("expense_claims").insert({
      claim_id: ids.financeClaim,
      ticket_id: "EXP-DEMO-PAY",
      submitter_employee_id: "emp-claimant-001",
      claim_kind: "Reimbursement",
      submission_mode: "SingleVoucher",
      claim_period_month: "2026-06-01",
      status: "FinanceConfirmed",
      total_amount: 4600,
      final_payable_amount: 4600,
      site_id: ids.site,
      physical_receipt_confirmed_at: "2026-06-08T08:30:00.000Z",
      physical_receipt_confirmed_by: "emp-finance-001",
      created_at: "2026-06-06T08:00:00.000Z",
      updated_at: "2026-06-08T08:30:00.000Z",
      is_deleted: false
    }),
    "insert finance-ready demo claim"
  );

  await must(
    db.from("expense_line_items").insert([
      {
        line_item_id: ids.financeLinePendingBilling,
        claim_id: ids.financeClaim,
        expense_head: "Housekeeping consumables",
        description: "Demo billable consumables pending client invoice",
        amount: 2600,
        transaction_date: "2026-06-06",
        payment_mode: "UPI",
        expense_tag: "PendingBilling",
        vendor_name: "Demo Vendor Supplies",
        vendor_invoice_number: "VENDOR-DEMO-PAY-001",
        billable_amount: 2600,
        invoice_validation_status: "PendingErpValidation",
        finance_review_status: "Accepted",
        billing_alert_created: true,
        site_id: ids.site,
        missing_receipt_flag: false,
        sort_order: 0,
        is_deleted: false
      },
      {
        line_item_id: ids.financeLineAlreadyBilled,
        claim_id: ids.financeClaim,
        expense_head: "Generator diesel",
        description: "Demo already billed diesel expense",
        amount: 2000,
        transaction_date: "2026-06-06",
        payment_mode: "Cash",
        expense_tag: "AlreadyBilled",
        client_invoice_number: "CLIENT-DEMO-PAY-001",
        vendor_name: "Demo Fuel Station",
        vendor_invoice_number: "VENDOR-DEMO-PAY-002",
        invoice_validation_status: "Valid",
        finance_review_status: "Accepted",
        billing_alert_created: false,
        site_id: ids.site,
        missing_receipt_flag: false,
        sort_order: 1,
        is_deleted: false
      }
    ]),
    "insert finance-ready demo lines"
  );

  await must(
    db.from("expense_attachments").insert({
      attachment_id: ids.financeAttachment,
      line_item_id: ids.financeLinePendingBilling,
      storage_path: "investor-demo/2026-06-06/EXP-DEMO-PAY/receipt.pdf",
      content_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      original_file_name: "demo-receipt.pdf",
      file_size_bytes: 2048,
      content_type: "application/pdf",
      uploaded_at: "2026-06-06T09:00:00.000Z",
      uploaded_by_user_id: "emp-claimant-001"
    }),
    "insert finance-ready demo receipt"
  );

  await must(
    db.from("approval_steps").insert({
      step_id: ids.approvalFinance,
      claim_id: ids.financeClaim,
      step_order: 1,
      required_approver_role: "Finance",
      assigned_approver_id: "emp-finance-001",
      decision: "Approved",
      decision_at: "2026-06-08T08:30:00.000Z",
      remarks: "Finance confirmed original voucher and accepted line items."
    }),
    "insert finance-ready demo approval step"
  );
}

async function seedAuditAndBillingQueues(db) {
  await must(
    db.from("billing_alerts").insert({
      alert_id: ids.billingAlert,
      line_item_id: ids.financeLinePendingBilling,
      claim_id: ids.financeClaim,
      created_at: "2026-06-06T10:00:00.000Z",
      next_send_at: "2026-06-08T10:00:00.000Z",
      escalation_level: 1,
      alerts_sent_count: 2,
      is_resolved: false
    }),
    "insert demo billing alert"
  );

  await must(
    db.from("fraud_flags").insert({
      flag_id: ids.fraudFlag,
      primary_claim_id: ids.financeClaim,
      related_claim_ids: [],
      rule_name: "ThresholdSplit",
      flagged_at: "2026-06-06T10:30:00.000Z",
      sweep_date: "2026-06-06",
      status: "Open",
      review_remarks: "Demo audit exception with receipt, vendor, invoice, approval, and billing evidence."
    }),
    "insert demo fraud flag"
  );
}

async function must(builder, action) {
  const { error } = await builder;
  if (error) {
    throw new Error(`${action} failed: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
