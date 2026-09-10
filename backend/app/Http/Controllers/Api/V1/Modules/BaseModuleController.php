<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Http\Requests\Modules\CreateRecordRequest;
use App\Http\Resources\RecordResource;
use App\Models\RecordAttachment;
use App\Models\RecordComment;
use App\Services\ActivityLogService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

abstract class BaseModuleController extends Controller
{
    protected string $module;
    protected string $viewPermission;
    protected string $createPermission;
    protected string $editPermission;
    protected string $deletePermission;
    protected string $approvePermission;

    /** Modules that have separate staff-level permissions */
    private const STAFF_MODULES = ['accounting', 'marketing', 'shipping', 'customs', 'returns', 'packaging'];

    public function __construct(protected readonly ActivityLogService $activityLogService) {}

    private function staffPerm(string $action): ?string
    {
        return in_array($this->module, self::STAFF_MODULES)
            ? "{$this->module}.staff.{$action}"
            : null;
    }

    private function can(\Illuminate\Contracts\Auth\Authenticatable $user, string $permission): bool
    {
        $staffPerm = $this->staffPerm(explode('.', $permission)[2] ?? '');
        return $user->hasPermission($permission)
            || ($staffPerm && $user->hasPermission($staffPerm));
    }

    abstract protected function getModelClass(): string;

    public function index(Request $request): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $query = $this->getModelClass()::where('company_id', $request->user()->company_id)
            ->withCount(['comments', 'attachments']);

        // Filters
        if ($search = $request->input('search')) {
            $query->search($search);
        }
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }
        if ($priority = $request->input('priority')) {
            $query->where('priority', $priority);
        }
        if ($type = $request->input('type')) {
            $query->where('type', $type);
        }
        if ($deptId = $request->input('department_id')) {
            $query->where('department_id', $deptId);
        }
        if ($dateFrom = $request->input('date_from')) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo = $request->input('date_to')) {
            $query->where('created_at', '<=', $dateTo . ' 23:59:59');
        }

        $records = $query->with(['createdBy', 'department'])
            ->orderBy($request->input('sort_by', 'created_at'), $request->input('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'success' => true,
            'data'    => RecordResource::collection($records->items()),
            'meta'    => [
                'current_page' => $records->currentPage(),
                'per_page'     => $records->perPage(),
                'total'        => $records->total(),
                'last_page'    => $records->lastPage(),
            ],
        ]);
    }

    public function store(CreateRecordRequest $request): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->createPermission), 403);

        $record = $this->getModelClass()::create(array_merge(
            $request->validated(),
            [
                'company_id' => $request->user()->company_id,
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
                'status'     => $request->input('status', 'pending'),
            ]
        ));

        $this->activityLogService->log("{$this->module}.record.created", $record, $request->user());

        return response()->json([
            'success' => true,
            'data'    => new RecordResource($record->load(['createdBy', 'department'])),
            'message' => 'Kayıt başarıyla oluşturuldu.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)
            ->with(['createdBy', 'updatedBy', 'approvedBy', 'department', 'comments.user', 'attachments'])
            ->withCount(['comments', 'attachments'])
            ->findOrFail($id);

        return response()->json(['success' => true, 'data' => new RecordResource($record)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->editPermission), 403);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $old    = $record->toArray();

        $record->update(array_merge(
            $request->except(['company_id', 'created_by', 'record_number']),
            ['updated_by' => $request->user()->id]
        ));

        $this->activityLogService->log(
            "{$this->module}.record.updated",
            $record,
            $request->user(),
            oldValues: $old,
            newValues: $request->all(),
        );

        return response()->json([
            'success' => true,
            'data'    => new RecordResource($record->fresh(['createdBy', 'department'])),
            'message' => 'Kayıt güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->deletePermission), 403);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $record->delete();

        $this->activityLogService->log("{$this->module}.record.deleted", $record, $request->user());

        return response()->json(['success' => true, 'message' => 'Kayıt silindi.']);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->editPermission), 403);

        $request->validate(['status' => ['required', 'string']]);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $old    = ['status' => $record->status];

        $updateData = ['status' => $request->status, 'updated_by' => $request->user()->id];

        if ($request->status === 'completed') {
            $updateData['completed_at'] = now();
        }
        if (in_array($request->status, ['approved']) && isset($record->approved_by)) {
            $updateData['approved_by'] = $request->user()->id;
        }

        $record->update($updateData);

        $this->activityLogService->log(
            "{$this->module}.record.status_changed",
            $record,
            $request->user(),
            oldValues: $old,
            newValues: ['status' => $request->status],
        );

        return response()->json(['success' => true, 'data' => new RecordResource($record)]);
    }

    public function comments(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $record   = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $comments = $record->comments()->with('user')->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => $comments->items(),
        ]);
    }

    public function addComment(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $request->validate([
            'content'     => ['required', 'string', 'max:5000'],
            'is_internal' => ['nullable', 'boolean'],
        ]);

        $record  = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);

        $comment = $record->comments()->create([
            'company_id'  => $request->user()->company_id,
            'user_id'     => $request->user()->id,
            'content'     => $request->content,
            'is_internal' => $request->boolean('is_internal', false),
        ]);

        return response()->json([
            'success' => true,
            'data'    => $comment->load('user'),
            'message' => 'Yorum eklendi.',
        ], 201);
    }

    public function addAttachment(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->editPermission), 403);

        $request->validate([
            'file' => ['required', 'file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,gif,zip,csv'],
        ]);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $file   = $request->file('file');

        $path = $file->store(
            "attachments/{$request->user()->company_id}/{$this->module}",
            's3'
        );

        $attachment = $record->attachments()->create([
            'company_id'    => $request->user()->company_id,
            'user_id'       => $request->user()->id,
            'original_name' => $file->getClientOriginalName(),
            'file_path'     => $path,
            'mime_type'     => $file->getMimeType(),
            'size'          => $file->getSize(),
            'disk'          => 's3',
        ]);

        return response()->json([
            'success' => true,
            'data'    => $attachment,
            'message' => 'Dosya yüklendi.',
        ], 201);
    }

    public function history(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $record = $this->getModelClass()::where('company_id', $request->user()->company_id)->findOrFail($id);
        $logs   = \App\Models\ActivityLog::forModel(get_class($record), $id)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json(['success' => true, 'data' => \App\Http\Resources\ActivityLogResource::collection($logs)]);
    }
}
