import { IsInt, Max, Min, NotEquals } from 'class-validator';

// +1 / -1 from the cart stepper, or -n to undo the last "add n".
export class ChangeQuantityDto {
  @IsInt()
  @Min(-50)
  @Max(50)
  @NotEquals(0)
  delta: number;
}
