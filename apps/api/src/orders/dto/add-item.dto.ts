import { IsOptional, IsInt } from 'class-validator';

export class AddOrderDto {
    @IsInt()
    menuItemId : number;

    @IsInt()
    quantity : number;

    @IsOptional() @IsInt({ each: true })
    modifierIds : number[];
}