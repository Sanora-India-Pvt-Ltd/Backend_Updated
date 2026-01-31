/**
 * Unit tests for auth.service: signup, login, reset (password reset flow).
 * Mocks: User, tokenService, deviceService, otpService, emailService, bcrypt, mongoose.
 */

const AppError = require('../../../core/errors/AppError');

jest.mock('../../../models/authorization/User');
jest.mock('../token.service');
jest.mock('../device.service');
jest.mock('../../../../core/infra/otp');
jest.mock('../../../../core/infra/email');
jest.mock('bcryptjs');

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../../models/authorization/User');
const tokenService = require('../token.service');
const deviceService = require('../device.service');
const { createOTPRecord, validateOTP } = require('../../../../core/infra/otp');
const emailService = require('../../../../core/infra/email');
const authService = require('../auth.service');

describe('auth.service', () => {
    const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mongoose.startSession = jest.fn().mockResolvedValue(mockSession);
        mockSession.startTransaction.mockResolvedValue(undefined);
        mockSession.commitTransaction.mockResolvedValue(undefined);
        mockSession.abortTransaction.mockResolvedValue(undefined);
        mockSession.endSession.mockResolvedValue(undefined);
    });

    describe('signup', () => {
        it('throws AppError when required fields are missing', async () => {
            await expect(
                authService.signup(
                    { email: 'a@b.com', password: '123456' },
                    'Device'
                )
            ).rejects.toThrow(AppError);
            await expect(
                authService.signup(
                    { email: '', password: '123456', firstName: 'A', lastName: 'B', phoneNumber: '+1', gender: 'Male' },
                    'Device'
                )
            ).rejects.toThrow(AppError);
        });

        it('throws AppError for invalid email format', async () => {
            User.findOne.mockResolvedValue(null);
            await expect(
                authService.signup(
                    {
                        email: 'not-an-email',
                        password: '123456',
                        confirmPassword: '123456',
                        firstName: 'A',
                        lastName: 'B',
                        phoneNumber: '+11234567890',
                        gender: 'Male',
                        emailVerificationToken: 't',
                        phoneVerificationToken: 't'
                    },
                    'Device'
                )
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when password is too short', async () => {
            User.findOne.mockResolvedValue(null);
            await expect(
                authService.signup(
                    {
                        email: 'a@b.com',
                        password: '12345',
                        confirmPassword: '12345',
                        firstName: 'A',
                        lastName: 'B',
                        phoneNumber: '+11234567890',
                        gender: 'Male',
                        emailVerificationToken: 't',
                        phoneVerificationToken: 't'
                    },
                    'Device'
                )
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when user already exists with email', async () => {
            User.findOne.mockResolvedValue({ _id: 'existing' });
            await expect(
                authService.signup(
                    {
                        email: 'a@b.com',
                        password: '123456',
                        confirmPassword: '123456',
                        firstName: 'A',
                        lastName: 'B',
                        phoneNumber: '+11234567890',
                        gender: 'Male',
                        emailVerificationToken: 't',
                        phoneVerificationToken: 't'
                    },
                    'Device'
                )
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when OTP tokens are missing', async () => {
            User.findOne.mockReturnValueOnce(null).mockReturnValueOnce(null);
            await expect(
                authService.signup(
                    {
                        email: 'a@b.com',
                        password: '123456',
                        confirmPassword: '123456',
                        firstName: 'A',
                        lastName: 'B',
                        phoneNumber: '+11234567890',
                        gender: 'Male'
                    },
                    'Device'
                )
            ).rejects.toThrow(AppError);
        });

        it('returns user, accessToken, refreshToken on valid signup', async () => {
            User.findOne.mockResolvedValue(null);
            tokenService.verifyEmailVerificationToken.mockReturnValue(undefined);
            tokenService.verifyPhoneVerificationToken.mockReturnValue(undefined);
            bcrypt.hash.mockResolvedValue('hashed');
            const mockUser = {
                _id: 'user123',
                profile: {
                    email: 'a@b.com',
                    name: { first: 'A', last: 'B', full: 'A B' },
                    phoneNumbers: { primary: '+11234567890' },
                    gender: 'Male'
                }
            };
            User.create.mockResolvedValue([mockUser]);
            tokenService.generateAccessToken.mockReturnValue('access-token');
            tokenService.generateRefreshToken.mockReturnValue({
                token: 'refresh-token',
                expiryDate: new Date()
            });
            deviceService.addRefreshTokenToUser.mockResolvedValue(undefined);

            const result = await authService.signup(
                {
                    email: 'a@b.com',
                    password: '123456',
                    confirmPassword: '123456',
                    firstName: 'A',
                    lastName: 'B',
                    phoneNumber: '+11234567890',
                    gender: 'Male',
                    emailVerificationToken: 'email-otp-token',
                    phoneVerificationToken: 'phone-otp-token'
                },
                'Device'
            );

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('accessToken', 'access-token');
            expect(result).toHaveProperty('refreshToken', 'refresh-token');
            expect(result.user).toMatchObject({ email: 'a@b.com', firstName: 'A', lastName: 'B' });
            expect(deviceService.addRefreshTokenToUser).toHaveBeenCalled();
            expect(mockSession.commitTransaction).toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('throws AppError when email/phone and password are missing', async () => {
            await expect(authService.login({}, 'Device')).rejects.toThrow(AppError);
            await expect(authService.login({ email: 'a@b.com' }, 'Device')).rejects.toThrow(AppError);
        });

        it('throws AppError when user not found', async () => {
            User.findOne.mockResolvedValue(null);
            await expect(
                authService.login({ email: 'a@b.com', password: '123456' }, 'Device')
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when password is wrong', async () => {
            User.findOne.mockResolvedValue({
                _id: 'u1',
                profile: { email: 'a@b.com', name: { first: 'A', last: 'B', full: 'A B' }, phoneNumbers: { primary: '+1' }, gender: 'Male' },
                auth: { password: 'hashed' }
            });
            bcrypt.compare.mockResolvedValue(false);
            await expect(
                authService.login({ email: 'a@b.com', password: 'wrong' }, 'Device')
            ).rejects.toThrow(AppError);
        });

        it('returns user, accessToken, refreshToken on valid login', async () => {
            const mockUser = {
                _id: 'u1',
                profile: { email: 'a@b.com', name: { first: 'A', last: 'B', full: 'A B' }, phoneNumbers: { primary: '+1' }, gender: 'Male' },
                auth: { password: 'hashed', tokens: { refreshTokens: [] } }
            };
            User.findOne.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            tokenService.generateAccessToken.mockReturnValue('access-token');
            tokenService.generateRefreshToken.mockReturnValue({
                token: 'refresh-token',
                expiryDate: new Date()
            });
            deviceService.addRefreshTokenToUser.mockResolvedValue(undefined);

            const result = await authService.login(
                { email: 'a@b.com', password: '123456' },
                'Device'
            );

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('accessToken', 'access-token');
            expect(result).toHaveProperty('refreshToken', 'refresh-token');
            expect(deviceService.addRefreshTokenToUser).toHaveBeenCalled();
        });
    });

    describe('resetPassword', () => {
        it('throws AppError when verificationToken or password missing', async () => {
            await expect(
                authService.resetPassword({ verificationToken: 't', password: '123456' })
            ).rejects.toThrow(AppError);
            await expect(
                authService.resetPassword({
                    verificationToken: 't',
                    password: '123456',
                    confirmPassword: 'different'
                })
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when password too short or mismatch', async () => {
            await expect(
                authService.resetPassword({
                    verificationToken: 't',
                    password: '12345',
                    confirmPassword: '12345'
                })
            ).rejects.toThrow(AppError);
            await expect(
                authService.resetPassword({
                    verificationToken: 't',
                    password: '123456',
                    confirmPassword: 'different'
                })
            ).rejects.toThrow(AppError);
        });

        it('updates password when token and passwords valid', async () => {
            tokenService.verifyPasswordResetToken.mockReturnValue({ userId: 'u1' });
            User.findById.mockResolvedValue({ _id: 'u1' });
            User.findByIdAndUpdate.mockReturnValue({
                lean: jest.fn().mockResolvedValue({})
            });
            bcrypt.hash.mockResolvedValue('new-hashed');

            await authService.resetPassword({
                verificationToken: 'valid-token',
                password: 'newpass123',
                confirmPassword: 'newpass123'
            });

            expect(tokenService.verifyPasswordResetToken).toHaveBeenCalledWith('valid-token');
            expect(User.findById).toHaveBeenCalledWith('u1');
            expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
            expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
                'u1',
                expect.objectContaining({ $set: expect.objectContaining({ 'auth.password': 'new-hashed' }) }),
                expect.any(Object)
            );
        });
    });
});
