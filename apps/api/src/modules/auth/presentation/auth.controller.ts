import {
  Controller,
  Post,
  Get,
  Body,
  HttpStatus,
  HttpCode,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  registerUserSchema,
  loginSchema,
  type RegisterUserRequest,
  type LoginRequest,
  type AuthResponse,
  type UserProfile,
} from '@nyx/contracts';
import { RegisterUserUseCase, LoginUseCase } from '../application/use-cases/auth.use-cases';
import { CurrentUser, Public } from '../infrastructure/decorators/auth.decorators';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<AuthResponse> {
    const parseResult = registerUserSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.registerUserUseCase.execute(parseResult.data as RegisterUserRequest);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<AuthResponse> {
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.loginUseCase.execute(parseResult.data as LoginRequest);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: UserProfile): UserProfile {
    return user;
  }
}
