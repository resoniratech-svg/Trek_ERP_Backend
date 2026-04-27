import { Request } from "express";
import { generateClientCode } from "../../utils/clientCodeGenerator";
import { getClientsRepo, updateClientRepo, deleteClientRepo, softDeleteClientRepo, addLicenseRepo, addAgreementRepo, getAgreementsRepo } from "./client.repository";
import { pool } from "../../config/db";

export const createClientService = async (data: any) => {
  const clientCode = await generateClientCode(data.division);

  const result = await pool.query(
    `INSERT INTO clients 
    (name, division, client_code, email, phone, address, contact_person, sector)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      data.companyName,
      data.division,
      clientCode,
      data.email,
      data.phone,
      data.address,
      data.contactPerson,
      data.sector || data.division // Fallback to division if sector is not provided
    ]
  );

  const client = result.rows[0];

  // licenses
  if (data.licenses?.length) {
    for (const lic of data.licenses) {
      await pool.query(
        `INSERT INTO client_licenses (client_id, license_name)
         VALUES ($1,$2)`,
        [client.id, lic]
      );
    }
  }

  // agreements
  if (data.agreements?.length) {
    for (const agr of data.agreements) {
      await pool.query(
        `INSERT INTO client_agreements
        (client_id, title, file_url, start_date, end_date)
        VALUES ($1,$2,$3,$4,$5)`,
        [
          client.id,
          agr.title,
          agr.fileUrl,
          agr.startDate,
          agr.endDate,
        ]
      );
    }
  }

  return { clientCode };
};

export const getClientsService = async (req: Request) => {
  const {
    division,
    sector,
    search = "",
    page = "1",
    limit = "10",
  } = req.query;

  const user = (req as any).user;

  if (!user) throw new Error("Unauthorized");

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  // Use sector if provided, otherwise fallback to user division logic if applicable
  const filterDivision = isSuperAdmin
    ? (division as string) || null
    : user.division || null;

  const filterSector = isSuperAdmin
    ? (sector as string) || null
    : (user.sector || user.division) || null;

  const pageNumber = Math.max(parseInt(page as string) || 1, 1);
  const limitNumber = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50);
  const offset = (pageNumber - 1) * limitNumber;

  // We should ideally update getClientsRepo to handle sector too.
  // For now, let's see if we can just pass it through division if they are the same, 
  // or update the repo.

  const result = await getClientsRepo(
    filterDivision,
    search as string,
    limitNumber,
    offset,
    isSuperAdmin,
    filterSector
  );

  return {
    total: result.total,
    page: pageNumber,
    limit: limitNumber,
    data: result.data,
  };
};

export const getClientByIdService = async (clientId: number) => {
  const clientRes = await pool.query(
    `SELECT c.*, 
            u.qid, u.cr_number, u.computer_card, 
            u.start_date, u.renewal_date, u.contract_type,
            u.company_name as user_company_name,
            u.qid_doc_url, u.cr_doc_url, u.computer_card_doc_url, u.contract_doc_url
     FROM clients c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.id = $1`,
    [clientId]
  );

  if (clientRes.rows.length === 0) {
    throw new Error("Client not found");
  }

  const client = clientRes.rows[0];

  const licensesRes = await pool.query(
    `SELECT license_name, license_type, license_number, expiry_date, document_url FROM client_licenses WHERE client_id = $1`,
    [clientId]
  );

  const agreementsRes = await pool.query(
    `SELECT title, file_url, start_date, end_date FROM client_agreements WHERE client_id = $1`,
    [clientId]
  );

  return {
    id: client.id,
    clientCode: client.client_code,
    division: client.division,
    companyName: client.name,
    sector: client.sector,
    email: client.email,
    phone: client.phone,
    address: client.address,
    contactPerson: client.contact_person,
    creditLimit: client.credit_limit,

    // Business documents from users table
    qid: client.qid,
    qidDocUrl: client.qid_doc_url,
    crNumber: client.cr_number,
    crDocUrl: client.cr_doc_url,
    computerCard: client.computer_card,
    computerCardDocUrl: client.computer_card_doc_url,
    contractDocUrl: client.contract_doc_url,
    
    startDate: client.start_date,
    renewalDate: client.renewal_date,
    contractType: client.contract_type,

    licenses: licensesRes.rows.map((l: any) => ({
      licenseName: l.license_name,
      licenseType: l.license_type,
      licenseNumber: l.license_number,
      expiryDate: l.expiry_date,
      documentUrl: l.document_url,
    })),

    agreements: agreementsRes.rows.map((a: any) => ({
      title: a.title,
      fileUrl: a.file_url,
      startDate: a.start_date,
      endDate: a.end_date,
    })),
  };
};

export const updateClientService = async (clientId: number, data: any) => {
  const fields: Record<string, any> = {};

  if (data.companyName) fields.name = data.companyName;
  if (data.email) fields.email = data.email;
  if (data.phone) fields.phone = data.phone;
  if (data.address) fields.address = data.address;
  if (data.contactPerson) fields.contact_person = data.contactPerson;
  if (data.sector) fields.sector = data.sector;
  if (data.division) fields.division = data.division;

  if (Object.keys(fields).length === 0 && !data.qid && !data.crNumber && !data.computerCard && !data.licenses) {
    throw new Error("No valid fields provided");
  }

  // 1. Update the 'clients' table
  let updatedClient = null;
  if (Object.keys(fields).length > 0) {
    updatedClient = await updateClientRepo(clientId, fields);
  } else {
    const res = await pool.query("SELECT * FROM clients WHERE id = $1", [clientId]);
    updatedClient = res.rows[0];
  }

  if (!updatedClient) {
    throw new Error("Client not found");
  }

  // 2. Sync with the 'users' table if linked
  if (updatedClient.user_id) {
    const userFields: string[] = [];
    const userParams: any[] = [];
    let idx = 1;

    const mapping: Record<string, string> = {
      qid: data.qid,
      cr_number: data.crNumber,
      computer_card: data.computerCard,
      contract_type: data.contractType,
      start_date: data.startDate,
      renewal_date: data.renewalDate,
      company_name: data.companyName,
      address: data.address,
      phone: data.phone,
      division: data.division,
      sector: data.sector,
      qid_doc_url: data.qidDocUrl,
      cr_doc_url: data.crDocUrl,
      computer_card_doc_url: data.computerCardDocUrl,
      contract_doc_url: data.contractDocUrl
    };

    for (const [col, val] of Object.entries(mapping)) {
      if (val !== undefined) {
        userFields.push(`${col} = $${idx++}`);
        userParams.push(val);
      }
    }

    if (userFields.length > 0) {
      userParams.push(updatedClient.user_id);
      await pool.query(
        `UPDATE users SET ${userFields.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
        userParams
      );
    }
  }

  // 3. Update Licenses (Clear existing and re-insert)
  if (data.licenses && Array.isArray(data.licenses)) {
    await pool.query(`DELETE FROM client_licenses WHERE client_id = $1`, [clientId]);
    
    for (const lic of data.licenses) {
      if (typeof lic === 'string') {
        // Simple string license name
        await pool.query(
          `INSERT INTO client_licenses (client_id, license_name) VALUES ($1, $2)`,
          [clientId, lic]
        );
      } else if (typeof lic === 'object') {
        // Full license object
        await pool.query(
          `INSERT INTO client_licenses (client_id, license_name, license_type, license_number, expiry_date, document_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            clientId,
            lic.type || lic.name || 'License',
            lic.type,
            lic.number,
            lic.expiryDate || null,
            lic.documentUrl || null
          ]
        );
      }
    }
  }

  // 4. Update Agreements / Supporting Docs
  if (data.documents && Array.isArray(data.documents)) {
    for (const doc of data.documents) {
      await pool.query(
        `INSERT INTO client_agreements (client_id, title, file_url)
         VALUES ($1, $2, $3)`,
        [clientId, doc.originalName || doc.name || 'Supporting Document', doc.url]
      );
    }
  }

  return updatedClient;
};

export const deleteClientService = async (clientId: number) => {
  // 1. Get the client first to find the user_id
  const clientRes = await pool.query("SELECT user_id FROM clients WHERE id = $1", [clientId]);
  const userId = clientRes.rows[0]?.user_id;

  // 2. Delete the client (This will also handle sub-tables if they have ON DELETE CASCADE, 
  // but we should be careful. Actually deleteClientRepo just deletes from 'clients')
  const deleted = await deleteClientRepo(clientId);
  if (!deleted) throw new Error("Client not found");

  // 3. Delete the associated user if it exists
  if (userId) {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    console.log(`[CLEANUP] Deleted associated user ${userId} for client ${clientId}`);
  }

  return deleted;
};

export const softDeleteClientService = async (clientId: number) => {
  const client = await softDeleteClientRepo(clientId);
  if (!client) throw new Error("Client not found");
  return client;
};

export const addLicenseService = async (clientId: number, licenseName: string) => {
  if (!licenseName) throw new Error("License name is required");
  return await addLicenseRepo(clientId, licenseName);
};

export const addAgreementService = async (clientId: number, data: any) => {
  if (!data.title) throw new Error("Agreement title is required");
  return await addAgreementRepo(clientId, data);
};

export const getAgreementsService = async (clientId: number) => {
  return await getAgreementsRepo(clientId);
};
