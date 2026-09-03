export interface BranchMappingProps {
  id: string;
  groupId: string;
  branchId: string;
  isPrimaryBranch: boolean;
}

export interface EnterpriseGroupProps {
  id: string;
  name: string;
  tenantId: string;
  branches: BranchMappingProps[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class EnterpriseGroup {
  constructor(private readonly props: EnterpriseGroupProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get name(): string {
    return this.props.name;
  }

  public get tenantId(): string {
    return this.props.tenantId;
  }

  public get branches(): BranchMappingProps[] {
    return this.props.branches;
  }

  public toJSON(): EnterpriseGroupProps {
    return { ...this.props };
  }
}
