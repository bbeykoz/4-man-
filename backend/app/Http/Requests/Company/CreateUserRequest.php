<?php

namespace App\Http\Requests\Company;

use Illuminate\Foundation\Http\FormRequest;

class CreateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('company.users.create');
    }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:100'],
            'email'         => ['required', 'email', 'unique:users,email', 'max:255'],
            'phone'         => ['nullable', 'string', 'max:20'],
            'title'         => ['nullable', 'string', 'max:100'],
            'password'      => ['nullable', 'string', 'min:8'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'role_id'       => ['nullable', 'uuid', 'exists:roles,id'],
            'status'        => ['nullable', 'in:active,inactive'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'  => 'Ad Soyad zorunludur.',
            'email.required' => 'E-posta adresi zorunludur.',
            'email.unique'   => 'Bu e-posta adresi kullanılıyor.',
        ];
    }
}
