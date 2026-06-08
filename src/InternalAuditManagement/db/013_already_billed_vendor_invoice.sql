alter table expense_line_items
  add constraint chk_already_billed_vendor_invoice
  check (expense_tag <> 'AlreadyBilled' or vendor_invoice_number is not null)
  not valid;
