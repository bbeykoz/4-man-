<?php

namespace App\Http\Requests\Company;

use Illuminate\Foundation\Http\FormRequest;

class CreateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('company.roles.create');
    }

    public function rules(): array
    {
        return [
            'display_name'  => ['required', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:500'],
            'level'         => ['required', 'integer', 'min:2', 'max:5'],
            'color'         => ['nullable', 'string', 'in:gray,blue,green,purple,orange,red,yellow'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'permissions'   => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ];
    }
}
