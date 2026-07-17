import { IsNotEmpty, IsString } from 'class-validator';

export class TenantLoginDto {
  @IsNotEmpty({ message: 'رمز الكافيه مطلوب' })
  @IsString()
  cafeCode: string;

  @IsNotEmpty({ message: 'اسم المستخدم أو الهاتف مطلوب' })
  @IsString()
  username: string;

  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @IsString()
  password: string;
}
