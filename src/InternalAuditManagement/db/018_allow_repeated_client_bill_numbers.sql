-- A client bill can legitimately cover multiple expense lines, including lines in
-- the same claim. Vendor invoice duplicate protection remains enforced in code.
drop index if exists ux_line_items_client_invoice_number;
