import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterCafeDto {
  @IsNotEmpty({ message: 'اسم المالك مطلوب' })
  @IsString()
  ownerName: string;

  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email: string;

  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  @IsString()
  phone: string;

  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;

  @IsNotEmpty({ message: 'اسم الكافيه مطلوب' })
  @IsString()
  cafeName: string;

  @IsNotEmpty({ message: 'عنوان الكافيه مطلوب' })
  @IsString()
  address: string;

  @IsNotEmpty({ message: 'تصنيف الكافيه مطلوب' })
  @IsString()
  category: string;
}
