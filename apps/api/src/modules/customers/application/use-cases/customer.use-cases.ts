import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateCustomerRequest, CustomerResponse, UserProfile } from '@nyx/contracts';
import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../ports/customer.repository';
import { assertCanReadCustomer } from '../../../auth/application/policies/resource-access.policy';

@Injectable()
export class CreateCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(dto: CreateCustomerRequest): Promise<CustomerResponse> {
    const existingEmail = await this.customerRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(`Customer with email "${dto.email}" already exists`);
    }

    const existingDoc = await this.customerRepository.findByDocument(dto.documentNumber);
    if (existingDoc) {
      throw new ConflictException(`Customer with document "${dto.documentNumber}" already exists`);
    }

    const customer = new Customer({
      id: randomUUID(),
      name: dto.name,
      email: dto.email,
      documentNumber: dto.documentNumber,
      status: 'active',
    });

    const saved = await this.customerRepository.save(customer);
    return this.toResponse(saved);
  }

  private toResponse(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      documentNumber: customer.documentNumber,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(id: string, currentUser: UserProfile): Promise<CustomerResponse> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with id "${id}" was not found`);
    }

    assertCanReadCustomer(currentUser, customer.id);

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      documentNumber: customer.documentNumber,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class ListCustomersUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  async execute(): Promise<CustomerResponse[]> {
    const customers = await this.customerRepository.findAll();
    return customers.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      documentNumber: c.documentNumber,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }
}
