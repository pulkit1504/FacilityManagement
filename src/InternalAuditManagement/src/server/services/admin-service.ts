import { forbidden } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { NotificationService } from "./notification-service";
import type { CleanupStaleRecordsInput, CreateContractInput, CreateEmployeeInput, CreateExpenseHeadInput, CreateHolidayInput, CreateSiteInput, ResetEmployeePasswordInput, UpdateExpenseHeadInput, UpdateSiteInput } from "../validation/claim.schemas";

export class AdminService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly notifications: NotificationService
  ) {}

  async listMasterData(user: UserContext) {
    this.assertAdmin(user);
    const [contracts, sites] = await Promise.all([
      this.claims.listContracts(),
      this.claims.listSites(true)
    ]);

    const [employees, holidays, expenseHeads] = await Promise.all([
      this.claims.listEmployees(),
      this.claims.listHolidays(),
      this.claims.listExpenseHeads(true)
    ]);

    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    const sitesWithClusterHeads = sites.map((site) => ({
      ...site,
      clusterHeadName: site.clusterHeadEmployeeId ? employeeNames.get(site.clusterHeadEmployeeId) ?? site.clusterHeadEmployeeId : null
    }));

    return { contracts, sites: sitesWithClusterHeads, employees, holidays, expenseHeads };
  }

  async createContract(input: CreateContractInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      contract: await this.claims.createContract(input),
      message: "Contract created."
    };
  }

  async createSite(input: CreateSiteInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      site: await this.claims.createSite(input),
      message: "Site created."
    };
  }

  async updateSite(siteId: string, input: UpdateSiteInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      site: await this.claims.updateSite(siteId, input),
      message: input.isActive ? "Site saved and active." : "Site saved and inactive."
    };
  }

  async deactivateSite(siteId: string, user: UserContext) {
    this.assertAdmin(user);
    await this.claims.deactivateSite(siteId);
    return {
      siteId,
      message: "Site marked inactive."
    };
  }

  async reactivateSite(siteId: string, user: UserContext) {
    this.assertAdmin(user);
    const site = (await this.claims.listSites(true)).find((item) => item.siteId === siteId);
    if (!site) {
      throw forbidden("Site was not found.");
    }
    if (!site.contractId || !site.clusterHeadEmployeeId) {
      throw forbidden("Add a contract and Cluster Head before reactivating this site.");
    }
    return {
      site: await this.claims.updateSite(siteId, {
        siteName: site.siteName,
        siteAddress: site.siteAddress,
        serviceType: site.serviceType,
        contractId: site.contractId,
        clusterHeadEmployeeId: site.clusterHeadEmployeeId,
        isActive: true
      }),
      message: "Site marked active."
    };
  }

  async assignSiteClusterHead(siteId: string, clusterHeadEmployeeId: string, user: UserContext) {
    this.assertAdmin(user);
    const employee = await this.claims.getEmployee(clusterHeadEmployeeId);
    if (!employee || employee.role !== "ClusterHead") {
      throw forbidden("Select an active employee with the Cluster Head role.");
    }
    return {
      site: await this.claims.assignSiteClusterHead(siteId, clusterHeadEmployeeId),
      message: "Site Cluster Head updated."
    };
  }

  async createEmployee(input: CreateEmployeeInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      employee: await this.claims.createEmployee(input),
      message: "Employee saved."
    };
  }

  async deactivateEmployee(employeeId: string, user: UserContext) {
    this.assertAdmin(user);
    await this.claims.deactivateEmployee(employeeId);
    return {
      employeeId,
      message: "Employee marked inactive."
    };
  }

  async createHoliday(input: CreateHolidayInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      holiday: await this.claims.createHoliday(input),
      message: "Holiday saved."
    };
  }

  async deleteHoliday(holidayDate: string, user: UserContext) {
    this.assertAdmin(user);
    await this.claims.deleteHoliday(holidayDate);
    return {
      holidayDate,
      message: "Holiday removed."
    };
  }

  async listExpenseHeads(user: UserContext) {
    this.assertAdmin(user);
    return {
      items: await this.claims.listExpenseHeads(true)
    };
  }

  async createExpenseHead(input: CreateExpenseHeadInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      expenseHead: await this.claims.createExpenseHead(input),
      message: "Expense head created."
    };
  }

  async updateExpenseHead(expenseHeadId: string, input: UpdateExpenseHeadInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      expenseHead: await this.claims.updateExpenseHead(expenseHeadId, input),
      message: "Expense head updated."
    };
  }

  async deactivateExpenseHead(expenseHeadId: string, user: UserContext) {
    this.assertAdmin(user);
    return {
      expenseHead: await this.claims.deactivateExpenseHead(expenseHeadId),
      message: "Expense head deactivated."
    };
  }

  async resetEmployeePassword(employeeId: string, input: ResetEmployeePasswordInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      employee: await this.claims.resetEmployeePassword(employeeId, input),
      message: "Temporary password set. Ask the user to sign in and change it."
    };
  }

  async listNotifications(user: UserContext) {
    return this.notifications.listNotifications(user);
  }

  async deliverNotifications(user: UserContext) {
    const result = await this.notifications.deliverQueued(user);
    return {
      ...result,
      message: `Notification delivery attempted for ${result.attempted} item(s). Sent ${result.sent}, failed ${result.failed}.`
    };
  }

  async cleanupStaleRecords(input: CleanupStaleRecordsInput, user: UserContext) {
    this.assertAdmin(user);
    const cutoff = new Date(Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.claims.cleanupStaleRecords(cutoff);
    return {
      ...result,
      cutoff,
      message: `Cleanup complete. Removed ${result.staleDraftsRemoved} stale draft(s) and ${result.exhaustedNotificationsRemoved} exhausted failed notification(s).`
    };
  }

  private assertAdmin(user: UserContext) {
    if (user.role !== "Admin") {
      throw forbidden("Only Admin users can manage operational setup.");
    }
  }
}
