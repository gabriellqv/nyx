import { Inject, Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { RegisterUserRequest, LoginRequest, AuthResponse, UserProfile } from '@nyx/contracts';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY, IUserRepository } from '../ports/user.repository';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(dto: RegisterUserRequest): Promise<AuthResponse> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`User with email "${dto.email}" already exists`);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = new User({
      id: randomUUID(),
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'user',
      customerId: null,
    });

    const saved = await this.userRepository.save(user);

    const userProfile: UserProfile = {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      customerId: saved.customerId,
    };

    const accessToken = this.jwtService.sign({
      sub: saved.id,
      email: saved.email,
      name: saved.name,
      role: saved.role,
      customerId: saved.customerId,
    });

    return {
      accessToken,
      user: userProfile,
    };
  }
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(dto: LoginRequest): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const userProfile: UserProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
    };

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
    });

    return {
      accessToken,
      user: userProfile,
    };
  }
}
